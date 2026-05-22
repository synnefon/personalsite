import {
  FEATURES_PER_TERRITORY,
  GLOBAL_FEATURES,
  type EncodedAdjacency,
  type EncodedBoard,
} from "./encoding.ts";

// Architecture constants — must match the trainable model in TFJS.
export const HIDDEN_DIM = 64;
export const EMBEDDING_DIM = 32;
export const PER_CELL_INPUT_DIM = FEATURES_PER_TERRITORY + GLOBAL_FEATURES;
export const MOVE_HEAD_INPUT_DIM = EMBEDDING_DIM * 2 + 1;

// Single source of truth for the trainable layer names. tfModel.ts, bake.ts,
// and serialize/deserialize all iterate this list — adding or removing a
// layer is a one-line change here plus matching layer construction in
// buildTfModel.
export const LAYER_NAMES = [
  "dense1",
  "dense2",
  "mp",
  "moveHead1",
  "moveHead2",
  "passHead1",
  "passHead2",
] as const;

export type LayerName = (typeof LAYER_NAMES)[number];

export type DenseWeights = {
  // Row-major: W[i, j] at index i * outDim + j. out[j] = Σ input[i] * W[i, j] + b[j].
  W: Float32Array;
  b: Float32Array;
};

// Architecture: per-cell MLP → message-passing layer → move/pass heads.
//
//   per-cell input  [PER_CELL_INPUT_DIM = 21]
//     → dense1 [21 → 64, relu]
//     → dense2 [64 → 32, relu]              = emb1
//     → concat(emb1, mean_neighbor(emb1))   [32 + 32 = 64]
//     → mp     [64 → 32, relu]              = emb2 (final embedding)
//
//   move scoring (per candidate (s, t)):
//     concat(emb2[s], emb2[t], winProb)     [32 + 32 + 1 = 65]
//     → moveHead1 [65 → 32, relu]
//     → moveHead2 [32 → 1, linear]          = Q(s, t)
//
//   pass scoring:
//     mean_pool(emb2)                       [32]
//     → passHead1 [32 → 32, relu]
//     → passHead2 [32 → 1, linear]          = Q(pass)
//
// ~8.8k params total (~35KB at fp32).
export type ModelWeights = Record<LayerName, DenseWeights>;

/**
 * Apply one Dense layer with ReLU activation, writing into `out` starting at
 * `outOffset`. Weights are row-major [inDim, outDim].
 */
// Module-scope scratch buffers, lazily resized to fit N territories.
// All forward functions read/write these instead of allocating fresh
// Float32Arrays per call, eliminating GC churn on the hot inference path.
type Scratch = {
  numTerritories: number;
  cellInput: Float32Array;
  hidden: Float32Array;
  emb1: Float32Array;
  emb2: Float32Array;
  mpInput: Float32Array;
  moveInput: Float32Array;
  moveHidden: Float32Array;
  passPooled: Float32Array;
  passHidden: Float32Array;
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
    moveInput: new Float32Array(MOVE_HEAD_INPUT_DIM),
    moveHidden: new Float32Array(EMBEDDING_DIM),
    passPooled: new Float32Array(EMBEDDING_DIM),
    passHidden: new Float32Array(EMBEDDING_DIM),
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
 * for the move/pass head's final output. Weights are [inDim, 1].
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
 * One forward pass over the whole board. Returns flat [N * EMBEDDING_DIM].
 * Caller reuses this output for every candidate move that turn.
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
 * Q-value for one candidate attack. Run computeEmbeddings once per turn,
 * then call this for each (source, target) pair the policy considers.
 */
export function scoreMove(
  embeddings: Float32Array,
  sourceId: number,
  targetId: number,
  winProb: number,
  weights: ModelWeights,
  numTerritories: number,
): number {
  const s = ensureScratch(numTerritories);
  for (let k = 0; k < EMBEDDING_DIM; k++) {
    s.moveInput[k] = embeddings[sourceId * EMBEDDING_DIM + k];
    s.moveInput[EMBEDDING_DIM + k] = embeddings[targetId * EMBEDDING_DIM + k];
  }
  s.moveInput[EMBEDDING_DIM * 2] = winProb;

  denseRelu(
    s.moveInput,
    weights.moveHead1,
    MOVE_HEAD_INPUT_DIM,
    EMBEDDING_DIM,
    s.moveHidden,
    0,
  );
  return denseLinearScalar(s.moveHidden, weights.moveHead2, EMBEDDING_DIM);
}

/**
 * Q-value for the "stop attacking" action. Mean-pools embeddings into a
 * single board summary, then runs the pass head. Replaces the linear AI's
 * `pickiness` knob.
 */
export function scorePass(
  embeddings: Float32Array,
  numTerritories: number,
  weights: ModelWeights,
): number {
  const s = ensureScratch(numTerritories);
  for (let k = 0; k < EMBEDDING_DIM; k++) s.passPooled[k] = 0;
  for (let i = 0; i < numTerritories; i++) {
    for (let k = 0; k < EMBEDDING_DIM; k++) {
      s.passPooled[k] += embeddings[i * EMBEDDING_DIM + k];
    }
  }
  for (let k = 0; k < EMBEDDING_DIM; k++) s.passPooled[k] /= numTerritories;

  denseRelu(
    s.passPooled,
    weights.passHead1,
    EMBEDDING_DIM,
    EMBEDDING_DIM,
    s.passHidden,
    0,
  );
  return denseLinearScalar(s.passHidden, weights.passHead2, EMBEDDING_DIM);
}
