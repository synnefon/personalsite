import * as tf from "@tensorflow/tfjs";
import {
  FEATURES_PER_TERRITORY,
  GLOBAL_FEATURES,
  type EncodedAdjacency,
  type EncodedBoard,
} from "../model/encoding.ts";
import {
  EMBEDDING_DIM,
  HIDDEN_DIM,
  MOVE_HEAD_INPUT_DIM,
  PER_CELL_INPUT_DIM,
  type DenseWeights,
  type ModelWeights,
} from "../model/forward.ts";

/**
 * TFJS-side mirror of the architecture in `model/forward.ts`. Same layer
 * widths, same activations, same data flow — but built from tf.layers so
 * gradients flow through and weights are trainable.
 */
export type TfModel = {
  dense1: tf.layers.Layer;
  dense2: tf.layers.Layer;
  mp: tf.layers.Layer;
  moveHead1: tf.layers.Layer;
  moveHead2: tf.layers.Layer;
  passHead1: tf.layers.Layer;
  passHead2: tf.layers.Layer;
};

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
    moveHead1: tf.layers.dense({
      name: "wotd_moveHead1",
      units: EMBEDDING_DIM,
      activation: "relu",
      inputShape: [MOVE_HEAD_INPUT_DIM],
    }),
    moveHead2: tf.layers.dense({
      name: "wotd_moveHead2",
      units: 1,
      inputShape: [EMBEDDING_DIM],
    }),
    passHead1: tf.layers.dense({
      name: "wotd_passHead1",
      units: EMBEDDING_DIM,
      activation: "relu",
      inputShape: [EMBEDDING_DIM],
    }),
    passHead2: tf.layers.dense({
      name: "wotd_passHead2",
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
  return tf.tensor2d(Array.from(matrix), [N, N]);
}

/**
 * Per-territory embeddings [N, EMBEDDING_DIM] for one board: build the
 * [N, F_T + F_G] input by broadcasting globals onto each cell, run the
 * per-cell MLP, then one message-passing pass via matMul with the
 * precomputed neighbor-mean matrix.
 */
export function forwardEmbeddings(
  model: TfModel,
  board: EncodedBoard,
  adjacencyMatrix: tf.Tensor,
): tf.Tensor {
  const N = adjacencyMatrix.shape[0]!;
  const perCell = tf.tensor2d(
    Array.from(board.perTerritory),
    [N, FEATURES_PER_TERRITORY],
  );
  const globals = tf
    .tensor1d(Array.from(board.global))
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
 * Q-value scalar for one candidate attack via the move head: gather source
 * + target embeddings, concat with the winProb scalar, run the two-layer
 * head.
 */
export function forwardScoreMove(
  model: TfModel,
  embeddings: tf.Tensor,
  sourceId: number,
  targetId: number,
  winProb: number,
): tf.Tensor {
  const src = embeddings.gather([sourceId]);
  const tgt = embeddings.gather([targetId]);
  const wp = tf.tensor2d([[winProb]], [1, 1]);
  const input = tf.concat([src, tgt, wp], 1);
  let h = model.moveHead1.apply(input) as tf.Tensor;
  h = model.moveHead2.apply(h) as tf.Tensor;
  return h.squeeze();
}

/**
 * Q-value scalar for the pass action: mean-pool all cell embeddings into a
 * single board summary, run the two-layer pass head.
 */
export function forwardScorePass(
  model: TfModel,
  embeddings: tf.Tensor,
): tf.Tensor {
  const pooled = embeddings.mean(0).expandDims(0);
  let h = model.passHead1.apply(pooled) as tf.Tensor;
  h = model.passHead2.apply(h) as tf.Tensor;
  return h.squeeze();
}

/**
 * Cross-entropy loss for warm-start imitation: stack the logits for pass
 * plus every candidate move, take softmax cross-entropy against the chosen
 * action index. Pass action lives at index 0; candidate i lives at index
 * i + 1.
 */
export function imitationLoss(
  model: TfModel,
  board: EncodedBoard,
  adjacencyMatrix: tf.Tensor,
  candidates: ReadonlyArray<{
    sourceId: number;
    targetId: number;
    winProb: number;
  }>,
  chosenIdx: number,
): tf.Scalar {
  const embeddings = forwardEmbeddings(model, board, adjacencyMatrix);
  const logits: tf.Tensor[] = [forwardScorePass(model, embeddings)];
  for (const c of candidates) {
    logits.push(
      forwardScoreMove(model, embeddings, c.sourceId, c.targetId, c.winProb),
    );
  }
  const stacked = tf.stack(logits);
  const targetIdx = chosenIdx === -1 ? 0 : chosenIdx + 1;
  const target = tf.oneHot(targetIdx, stacked.shape[0]!);
  return tf.losses.softmaxCrossEntropy(target, stacked) as tf.Scalar;
}

/**
 * Binary cross-entropy loss for self-play outcome: score only the chosen
 * action, regress its sigmoid output toward the per-player win label.
 * Uses the numerically-stable BCE-from-logits identity
 * `max(x, 0) - x*z + log(1 + exp(-|x|))` directly rather than
 * tf.losses.sigmoidCrossEntropy, which doesn't trace gradients cleanly
 * through scalar logits in this version of TFJS.
 */
export function outcomeLoss(
  model: TfModel,
  board: EncodedBoard,
  adjacencyMatrix: tf.Tensor,
  candidates: ReadonlyArray<{
    sourceId: number;
    targetId: number;
    winProb: number;
  }>,
  chosenIdx: number,
  won: boolean,
): tf.Scalar {
  const embeddings = forwardEmbeddings(model, board, adjacencyMatrix);

  // Compute every head's output so all trainable layers appear in the
  // gradient graph regardless of which action was chosen. Without this,
  // Adam's per-variable accumulators get out of sync across pass-vs-move
  // samples and the apply step throws a shape-broadcast error.
  const passLogit = forwardScorePass(model, embeddings);
  const moveLogits = candidates.map((c) =>
    forwardScoreMove(model, embeddings, c.sourceId, c.targetId, c.winProb),
  );

  const chosenLogit =
    chosenIdx === -1 ? passLogit : moveLogits[chosenIdx];

  const x = chosenLogit.reshape([1]);
  const z = tf.tensor1d([won ? 1 : 0]);
  const bce = x
    .relu()
    .sub(x.mul(z))
    .add(x.abs().neg().exp().add(1).log());

  // Touch every unused logit with a zero-coefficient term so it still
  // participates in autodiff (contributes 0 to the loss value).
  const everyLogit = tf.stack([passLogit, ...moveLogits]);
  const dummy = everyLogit.sum().mul(0);

  return bce.sum().add(dummy) as tf.Scalar;
}

/**
 * Pull a Dense layer's weights out as { W, b } Float32Arrays, matching the
 * row-major [inDim, outDim] layout that hand-rolled forward.ts expects.
 */
async function readDense(layer: tf.layers.Layer): Promise<DenseWeights> {
  const ws = layer.getWeights();
  const W = new Float32Array(await ws[0].data());
  const b = new Float32Array(await ws[1].data());
  return { W, b };
}

/**
 * Snapshot the TFJS model's trainable weights into the plain Float32Array
 * format used by the hand-rolled forward pass. Useful both for periodic
 * checkpointing and for final baking into weights.ts.
 */
export async function extractWeights(model: TfModel): Promise<ModelWeights> {
  return {
    dense1: await readDense(model.dense1),
    dense2: await readDense(model.dense2),
    mp: await readDense(model.mp),
    moveHead1: await readDense(model.moveHead1),
    moveHead2: await readDense(model.moveHead2),
    passHead1: await readDense(model.passHead1),
    passHead2: await readDense(model.passHead2),
  };
}

/**
 * Load a previously-saved ModelWeights snapshot into a fresh TfModel. Must
 * be called after `buildTfModel()` and before the first training step; the
 * layer must have been built (any apply() call or having inputShape set
 * triggers build).
 */
export function applyWeights(model: TfModel, weights: ModelWeights): void {
  const setDense = (
    layer: tf.layers.Layer,
    w: DenseWeights,
  ): void => {
    const wShape = layer.getWeights()[0].shape;
    const bShape = layer.getWeights()[1].shape;
    layer.setWeights([
      tf.tensor(Array.from(w.W), wShape),
      tf.tensor(Array.from(w.b), bShape),
    ]);
  };
  setDense(model.dense1, weights.dense1);
  setDense(model.dense2, weights.dense2);
  setDense(model.mp, weights.mp);
  setDense(model.moveHead1, weights.moveHead1);
  setDense(model.moveHead2, weights.moveHead2);
  setDense(model.passHead1, weights.passHead1);
  setDense(model.passHead2, weights.passHead2);
}

/**
 * Serialize ModelWeights to a JSON-friendly plain-number layout. Use with
 * `JSON.stringify` and a file write for on-disk checkpoints.
 */
export function serializeWeights(weights: ModelWeights): Record<string, {
  W: number[];
  b: number[];
}> {
  const conv = (w: DenseWeights): { W: number[]; b: number[] } => ({
    W: Array.from(w.W),
    b: Array.from(w.b),
  });
  return {
    dense1: conv(weights.dense1),
    dense2: conv(weights.dense2),
    mp: conv(weights.mp),
    moveHead1: conv(weights.moveHead1),
    moveHead2: conv(weights.moveHead2),
    passHead1: conv(weights.passHead1),
    passHead2: conv(weights.passHead2),
  };
}

/** Inverse of serializeWeights. */
export function deserializeWeights(
  raw: Record<string, { W: number[]; b: number[] }>,
): ModelWeights {
  const conv = (j: { W: number[]; b: number[] }): DenseWeights => ({
    W: Float32Array.from(j.W),
    b: Float32Array.from(j.b),
  });
  return {
    dense1: conv(raw.dense1),
    dense2: conv(raw.dense2),
    mp: conv(raw.mp),
    moveHead1: conv(raw.moveHead1),
    moveHead2: conv(raw.moveHead2),
    passHead1: conv(raw.passHead1),
    passHead2: conv(raw.passHead2),
  };
}
