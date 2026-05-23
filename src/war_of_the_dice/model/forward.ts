import {
  FEATURES_PER_TERRITORY,
  GLOBAL_FEATURES,
  type EncodedAdjacency,
  type EncodedBoard,
} from "./encoding.ts";

// Architecture constants — must match the trainable model in TFJS.
//
// Dimensions are intentionally small: the thesis's WPM-D (which we're
// closely modeled on) used logistic regression with ~14 features, total
// ~14 parameters. We're at ~770 params, which is already much more
// expressive than the thesis baseline. Bigger encoder dims overfit the
// per-cell encoder to noise — the value head then can't distinguish
// pre/post-attack states reliably, and the policy degenerates to "pass
// always".
export const HIDDEN_DIM = 16;
export const EMBEDDING_DIM = 8;
export const PER_CELL_INPUT_DIM = FEATURES_PER_TERRITORY + GLOBAL_FEATURES;

// Single source of truth for the trainable layer names. tfModel.ts, bake.ts,
// and serialize/deserialize all iterate this list — adding or removing a
// layer is a one-line change here plus matching layer construction in
// buildTfModel.
export const LAYER_NAMES = [
  "dense1",
  "dense2",
  "mp",
  "valueHead1",
  "valueHead2",
] as const;

export type LayerName = (typeof LAYER_NAMES)[number];

export type DenseWeights = {
  // Row-major: W[i, j] at index i * outDim + j. out[j] = Σ input[i] * W[i, j] + b[j].
  W: Float32Array;
  b: Float32Array;
};

// Architecture: per-cell MLP → message-passing layer → mean-pool → value head.
//
//   per-cell input  [PER_CELL_INPUT_DIM]
//     → dense1 [→ 64, relu]
//     → dense2 [→ 32, relu]                  = emb1
//     → concat(emb1, mean_neighbor(emb1))   [64]
//     → mp     [→ 32, relu]                  = emb2 (final cell embedding)
//
//   value scoring (one per state, from the actor's POV via the encoder
//   personality + actor input slot):
//     mean_pool(emb2)                        [32]
//     → valueHead1 [→ 32, relu]
//     → valueHead2 [→ 1, linear]            = logit of P(actor wins)
//
// Decision rule lives outside this module: for each candidate attack,
// the policy simulates the success/fail outcomes, calls scoreValue on
// each, and picks the action maximizing
//     P_attack * V(s_success) + (1 - P_attack) * V(s_fail).
// Pass is just V(s_current). See `model/policy.ts`.
export type ModelWeights = Record<LayerName, DenseWeights>;

// Module-scope scratch buffers, lazily resized to fit N territories.
// All forward functions read/write these instead of allocating fresh
// Float32Arrays per call, eliminating GC churn on the hot inference path.
// Single-threaded JS only — re-entrant inference would corrupt scratch.
type Scratch = {
  numTerritories: number;
  cellInput: Float32Array;
  hidden: Float32Array;
  emb1: Float32Array;
  emb2: Float32Array;
  mpInput: Float32Array;
  pooled: Float32Array;
  valueHidden: Float32Array;
};

let scratch: Scratch | null = null;

/**
 * Lazily build (or grow) the module-scope scratch buffers for `n`
 * territories. Same Scratch is reused for every forward call as long as N
 * doesn't change.
 */
function ensureScratch(n: number): Scratch {
  if (scratch && scratch.numTerritories === n) return scratch;
  scratch = {
    numTerritories: n,
    cellInput: new Float32Array(PER_CELL_INPUT_DIM),
    hidden: new Float32Array(HIDDEN_DIM),
    emb1: new Float32Array(n * EMBEDDING_DIM),
    emb2: new Float32Array(n * EMBEDDING_DIM),
    mpInput: new Float32Array(EMBEDDING_DIM * 2),
    pooled: new Float32Array(EMBEDDING_DIM),
    valueHidden: new Float32Array(EMBEDDING_DIM),
  };
  return scratch;
}

/**
 * Apply one Dense layer with ReLU activation, writing into `out` starting at
 * `outOffset`. Weights are row-major [inDim, outDim].
 */
function denseRelu(
  input: Float32Array,
  weights: DenseWeights,
  inDim: number,
  outDim: number,
  out: Float32Array,
  outOffset: number,
): void {
  const { W, b } = weights;
  for (let j = 0; j < outDim; j++) {
    let sum = b[j];
    for (let i = 0; i < inDim; i++) {
      sum += input[i] * W[i * outDim + j];
    }
    out[outOffset + j] = sum > 0 ? sum : 0;
  }
}

/**
 * Apply a Dense layer that produces a single scalar (no activation). Used
 * for the value head's final output. Weights are [inDim, 1].
 */
function denseLinearScalar(
  input: Float32Array,
  weights: DenseWeights,
  inDim: number,
): number {
  const { W, b } = weights;
  let sum = b[0];
  for (let i = 0; i < inDim; i++) sum += input[i] * W[i];
  return sum;
}

/**
 * One forward pass over the whole board, producing per-cell embeddings.
 * Returns flat [N * EMBEDDING_DIM]. The caller passes this output to
 * `scoreValue` to get the state value.
 */
export function computeEmbeddings(
  board: EncodedBoard,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
): Float32Array {
  const N = adjacency.numTerritories;
  const s = ensureScratch(N);

  // Global features don't vary per-cell — copy them into the scratch input
  // block once, then only overwrite the per-territory slice each iteration.
  for (let k = 0; k < GLOBAL_FEATURES; k++) {
    s.cellInput[FEATURES_PER_TERRITORY + k] = board.global[k];
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < FEATURES_PER_TERRITORY; k++) {
      s.cellInput[k] = board.perTerritory[i * FEATURES_PER_TERRITORY + k];
    }
    denseRelu(s.cellInput, weights.dense1, PER_CELL_INPUT_DIM, HIDDEN_DIM, s.hidden, 0);
    denseRelu(s.hidden, weights.dense2, HIDDEN_DIM, EMBEDDING_DIM, s.emb1, i * EMBEDDING_DIM);
  }

  for (let i = 0; i < N; i++) {
    const startNbr = adjacency.offsets[i];
    const endNbr = adjacency.offsets[i + 1];
    const nbrCount = endNbr - startNbr;

    for (let k = 0; k < EMBEDDING_DIM; k++) {
      s.mpInput[k] = s.emb1[i * EMBEDDING_DIM + k];
      s.mpInput[EMBEDDING_DIM + k] = 0;
    }
    if (nbrCount > 0) {
      for (let pos = startNbr; pos < endNbr; pos++) {
        const j = adjacency.neighbors[pos];
        for (let k = 0; k < EMBEDDING_DIM; k++) {
          s.mpInput[EMBEDDING_DIM + k] += s.emb1[j * EMBEDDING_DIM + k];
        }
      }
      for (let k = 0; k < EMBEDDING_DIM; k++) {
        s.mpInput[EMBEDDING_DIM + k] /= nbrCount;
      }
    }
    denseRelu(s.mpInput, weights.mp, EMBEDDING_DIM * 2, EMBEDDING_DIM, s.emb2, i * EMBEDDING_DIM);
  }

  return s.emb2;
}

/**
 * Value scalar for one board state, from the perspective of the actor
 * encoded into `board`. Output is the logit of P(actor wins); pass it
 * through sigmoid if you need a probability. Mean-pools the per-cell
 * embeddings and runs the two-layer value head.
 */
export function scoreValue(
  embeddings: Float32Array,
  numTerritories: number,
  weights: ModelWeights,
): number {
  const s = ensureScratch(numTerritories);
  for (let k = 0; k < EMBEDDING_DIM; k++) s.pooled[k] = 0;
  for (let i = 0; i < numTerritories; i++) {
    for (let k = 0; k < EMBEDDING_DIM; k++) {
      s.pooled[k] += embeddings[i * EMBEDDING_DIM + k];
    }
  }
  for (let k = 0; k < EMBEDDING_DIM; k++) s.pooled[k] /= numTerritories;

  denseRelu(
    s.pooled,
    weights.valueHead1,
    EMBEDDING_DIM,
    EMBEDDING_DIM,
    s.valueHidden,
    0,
  );
  return denseLinearScalar(s.valueHidden, weights.valueHead2, EMBEDDING_DIM);
}
