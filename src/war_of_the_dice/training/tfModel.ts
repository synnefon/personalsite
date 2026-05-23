import * as tf from "@tensorflow/tfjs-node";
import {
  FEATURES_PER_TERRITORY,
  type EncodedAdjacency,
  type EncodedBoard,
} from "../model/encoding.ts";
import {
  EMBEDDING_DIM,
  HIDDEN_DIM,
  LAYER_NAMES,
  PER_CELL_INPUT_DIM,
  type DenseWeights,
  type LayerName,
  type ModelWeights,
} from "../model/forward.ts";

/**
 * TFJS-side mirror of the architecture in `model/forward.ts`. Same layer
 * widths, same activations, same data flow — but built from tf.layers so
 * gradients flow through and weights are trainable.
 */
export type TfModel = Record<LayerName, tf.layers.Layer>;

/**
 * Build a fresh TfModel with randomly-initialized weights. Each layer
 * declares its inputShape so it builds on construction without needing a
 * dummy forward pass first.
 */
export function buildTfModel(): TfModel {
  return {
    dense1: tf.layers.dense({
      name: "wotd_dense1",
      units: HIDDEN_DIM,
      activation: "relu",
      inputShape: [PER_CELL_INPUT_DIM],
    }),
    dense2: tf.layers.dense({
      name: "wotd_dense2",
      units: EMBEDDING_DIM,
      activation: "relu",
      inputShape: [HIDDEN_DIM],
    }),
    mp: tf.layers.dense({
      name: "wotd_mp",
      units: EMBEDDING_DIM,
      activation: "relu",
      inputShape: [EMBEDDING_DIM * 2],
    }),
    valueHead1: tf.layers.dense({
      name: "wotd_valueHead1",
      units: EMBEDDING_DIM,
      activation: "relu",
      inputShape: [EMBEDDING_DIM],
    }),
    valueHead2: tf.layers.dense({
      name: "wotd_valueHead2",
      units: 1,
      inputShape: [EMBEDDING_DIM],
    }),
  };
}

/**
 * Build the row-normalized neighbor matrix M ∈ R^[N, N]: M[i, j] = 1/|N(i)|
 * if j is a neighbor of i, else 0. Isolated cells get a zero row. Computed
 * once per game from the constant adjacency; matMul against this matrix is
 * the message-passing aggregation step.
 */
export function adjacencyToMeanMatrix(adj: EncodedAdjacency): tf.Tensor {
  const N = adj.numTerritories;
  const matrix = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    const start = adj.offsets[i];
    const end = adj.offsets[i + 1];
    const count = end - start;
    if (count === 0) continue;
    const weight = 1 / count;
    for (let k = start; k < end; k++) {
      const j = adj.neighbors[k];
      matrix[i * N + j] = weight;
    }
  }
  return tf.tensor2d(matrix, [N, N]);
}

/**
 * Per-territory embeddings [N, EMBEDDING_DIM] for one board. Mirrors
 * `forward.computeEmbeddings` but built from tf ops so gradients flow.
 */
export function forwardEmbeddings(
  model: TfModel,
  board: EncodedBoard,
  adjacencyMatrix: tf.Tensor,
): tf.Tensor {
  const N = adjacencyMatrix.shape[0]!;
  const perCell = tf.tensor2d(board.perTerritory, [N, FEATURES_PER_TERRITORY]);
  const globals = tf
    .tensor1d(board.global)
    .expandDims(0)
    .tile([N, 1]);
  const input = tf.concat([perCell, globals], 1);

  let h = model.dense1.apply(input) as tf.Tensor;
  h = model.dense2.apply(h) as tf.Tensor;

  const neighborMean = adjacencyMatrix.matMul(h);
  const mpInput = tf.concat([h, neighborMean], 1);
  return model.mp.apply(mpInput) as tf.Tensor;
}

/**
 * State-value scalar (logit of P(actor wins)). Mean-pools per-cell
 * embeddings into a single board summary, then runs the two-layer value
 * head. Mirrors `forward.scoreValue`.
 */
export function forwardScoreValue(
  model: TfModel,
  embeddings: tf.Tensor,
): tf.Tensor {
  const pooled = embeddings.mean(0).expandDims(0);
  let h = model.valueHead1.apply(pooled) as tf.Tensor;
  h = model.valueHead2.apply(h) as tf.Tensor;
  return h.squeeze();
}

/**
 * BCE-with-logits loss against a binary win/loss label. `label` is 1 if
 * the actor encoded in `board` ended up winning the game, 0 otherwise.
 * Uses the numerically-stable identity
 * `max(x, 0) - x*z + log(1 + exp(-|x|))` directly rather than
 * tf.losses.sigmoidCrossEntropy, which doesn't trace gradients cleanly
 * through scalar logits in this version of TFJS.
 *
 * No "anchor" trick needed here (unlike the old per-action Q-loss): every
 * training step touches the same set of variables (encoder + value head),
 * so TFJS Adam's positional accumulator indexing stays stable across
 * steps automatically.
 */
export function valueLoss(
  model: TfModel,
  board: EncodedBoard,
  adjacencyMatrix: tf.Tensor,
  label: 0 | 1,
): tf.Scalar {
  const embeddings = forwardEmbeddings(model, board, adjacencyMatrix);
  const logit = forwardScoreValue(model, embeddings).reshape([1]);
  const z = tf.tensor1d([label]);
  const bce = logit
    .relu()
    .sub(logit.mul(z))
    .add(logit.abs().neg().exp().add(1).log());
  return bce.sum() as tf.Scalar;
}

/**
 * Pull a Dense layer's weights out as { W, b } Float32Arrays, matching the
 * row-major [inDim, outDim] layout that hand-rolled forward.ts expects.
 */
async function readDense(layer: tf.layers.Layer): Promise<DenseWeights> {
  const ws = layer.getWeights();
  const [W, b] = await Promise.all([ws[0].data(), ws[1].data()]);
  return { W: W as Float32Array, b: b as Float32Array };
}

/**
 * Snapshot the TFJS model's trainable weights into the plain Float32Array
 * format used by the hand-rolled forward pass. Useful both for periodic
 * checkpointing and for final baking into weights.ts. Layer reads run in
 * parallel.
 */
export async function extractWeights(model: TfModel): Promise<ModelWeights> {
  const entries = await Promise.all(
    LAYER_NAMES.map(async (name) => [name, await readDense(model[name])] as const),
  );
  return Object.fromEntries(entries) as ModelWeights;
}

/**
 * Load a previously-saved ModelWeights snapshot into a fresh TfModel. Must
 * be called after `buildTfModel()` and before the first training step; the
 * layer must have been built (any apply() call or having inputShape set
 * triggers build).
 */
export function applyWeights(model: TfModel, weights: ModelWeights): void {
  const setDense = (layer: tf.layers.Layer, w: DenseWeights): void => {
    const [Wvar, bvar] = layer.getWeights();
    layer.setWeights([tf.tensor(w.W, Wvar.shape), tf.tensor(w.b, bvar.shape)]);
  };
  for (const name of LAYER_NAMES) {
    setDense(model[name], weights[name]);
  }
}

/**
 * Serialize ModelWeights to a JSON-friendly plain-number layout. Use with
 * `JSON.stringify` and a file write for on-disk checkpoints.
 */
export function serializeWeights(
  weights: ModelWeights,
): Record<LayerName, { W: number[]; b: number[] }> {
  const out = {} as Record<LayerName, { W: number[]; b: number[] }>;
  for (const name of LAYER_NAMES) {
    out[name] = {
      W: Array.from(weights[name].W),
      b: Array.from(weights[name].b),
    };
  }
  return out;
}

/** Inverse of serializeWeights. */
export function deserializeWeights(
  raw: Record<string, { W: number[]; b: number[] }>,
): ModelWeights {
  const out = {} as ModelWeights;
  for (const name of LAYER_NAMES) {
    out[name] = {
      W: Float32Array.from(raw[name].W),
      b: Float32Array.from(raw[name].b),
    };
  }
  return out;
}
