import { winProbability, type AIMove } from "../ai.ts";
import type { GameMap } from "../types.ts";
import {
  encodeAdjacency,
  encodeBoard,
  type EncodedAdjacency,
} from "./encoding.ts";
import {
  computeEmbeddings,
  scoreMove,
  scorePass,
  type ModelWeights,
} from "./forward.ts";

/**
 * Every legal attack move for `playerId` on the current board: each source
 * the player owns with >= 2 dice, paired with each adjacent enemy cell.
 */
export function enumerateLegalAttacks(
  map: GameMap,
  playerId: number,
): AIMove[] {
  const out: AIMove[] = [];
  for (let s = 0; s < map.territories.length; s++) {
    const source = map.territories[s];
    if (source.ownerId !== playerId) continue;
    if (source.dice < 2) continue;
    const neighbors = map.adjacency.get(s);
    if (!neighbors) continue;
    for (const tgt of neighbors) {
      if (map.territories[tgt].ownerId !== playerId) {
        out.push({ sourceId: s, targetId: tgt });
      }
    }
  }
  return out;
}

/**
 * Greedy NN policy: encode board, compute embeddings once, score every
 * legal attack plus the pass action, pick the argmax. Returns null when
 * pass is chosen (end-of-turn signal). Pre-computed adjacency is reused
 * if the caller already has it.
 */
export function selectBestAttackModel(
  map: GameMap,
  playerId: number,
  weights: ModelWeights,
  turnIndex: number,
  adjacency?: EncodedAdjacency,
): AIMove | null {
  const adj = adjacency ?? encodeAdjacency(map);
  const board = encodeBoard(map, playerId, turnIndex);
  const embeddings = computeEmbeddings(board, adj, weights);

  const candidates = enumerateLegalAttacks(map, playerId);
  let bestMove: AIMove | null = null;
  let bestScore = scorePass(embeddings, adj.numTerritories, weights);
  for (const move of candidates) {
    const wp = winProbability(
      map.territories[move.sourceId].dice,
      map.territories[move.targetId].dice,
    );
    const q = scoreMove(embeddings, move.sourceId, move.targetId, wp, weights);
    if (q > bestScore) {
      bestScore = q;
      bestMove = move;
    }
  }
  return bestMove;
}

/**
 * Stochastic NN policy: score actions like selectBestAttackModel, then
 * sample via softmax over Q-values with temperature `temp`. Used during
 * self-play to explore beyond greedy. Lower temp → closer to greedy;
 * higher temp → closer to uniform.
 */
export function sampleAttackModel(
  map: GameMap,
  playerId: number,
  weights: ModelWeights,
  turnIndex: number,
  temp: number,
  rng: () => number = Math.random,
  adjacency?: EncodedAdjacency,
): AIMove | null {
  const adj = adjacency ?? encodeAdjacency(map);
  const board = encodeBoard(map, playerId, turnIndex);
  const embeddings = computeEmbeddings(board, adj, weights);

  const candidates = enumerateLegalAttacks(map, playerId);
  const logits: number[] = [
    scorePass(embeddings, adj.numTerritories, weights),
  ];
  for (const m of candidates) {
    const wp = winProbability(
      map.territories[m.sourceId].dice,
      map.territories[m.targetId].dice,
    );
    logits.push(
      scoreMove(embeddings, m.sourceId, m.targetId, wp, weights),
    );
  }

  let maxLogit = -Infinity;
  for (const l of logits) if (l > maxLogit) maxLogit = l;
  const safeTemp = Math.max(temp, 1e-6);
  let sum = 0;
  const exps: number[] = [];
  for (const l of logits) {
    const e = Math.exp((l - maxLogit) / safeTemp);
    exps.push(e);
    sum += e;
  }
  let r = rng() * sum;
  for (let i = 0; i < exps.length; i++) {
    r -= exps[i];
    if (r <= 0) {
      return i === 0 ? null : candidates[i - 1];
    }
  }
  return null;
}
