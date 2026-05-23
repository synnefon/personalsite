import { winProbability } from "../ai.ts";
import { MAX_DICE_PER_TERRITORY, NUM_PLAYERS } from "../constants.ts";
import type { GameMap } from "../types.ts";

// Per-territory feature layout (row-major in `perTerritory`):
//   0  own dice / 8
//   1  is_mine (acting player owns)
//   2  frontier flag (any neighbor with different owner)
//   3  friendly neighbor dice sum / 48
//   4  enemy neighbor dice sum / 48
//   5  max single enemy neighbor dice / 8
//   6  enemy neighbor count / 6
//   7  (own dice - max enemy neighbor dice) / 8
//   8  expected holding probability for one round
//   9  best outbound attack winProb (0 if can't attack)
//  10  amputation cost / N (smaller-piece size if this cell falls)
//  11  owner's largest connected component / N
//  12  owner's total dice / total dice in play
//  13  owner's effective end-of-turn income / N
//
// Global feature layout:
//   0  players remaining / NUM_PLAYERS
//   1  total dice in play / (N * 8)
//   2  frontier edge count / (N * 3)
//   3  strongest enemy effective income / N
//   4  mean enemy effective income / N
//   5  weakest enemy effective income / N
//   6  turn index / 250 (clamped to 1)
//   7  actor largest component (score) / N
//   8  actor total dice / total dice in play
//   9  actor owned count / N
//  10  actor effective income / N
//
// Indexed positionally — the model relies on this ordering.
//
// Actor-specific globals 7–10 are the analog of WPM's per-player score
// and log-dice features (thesis Sec 5.4.1 / 5.4.2). They give the value
// head a direct, low-noise signal that's mechanically tied to win rate —
// without these the per-cell encoder is the only path for the model to
// infer "how strong am I", which is brittle.
export const FEATURES_PER_TERRITORY = 14;
export const GLOBAL_FEATURES = 11;

export type EncodedBoard = {
  perTerritory: Float32Array;
  global: Float32Array;
};

// CSR-style adjacency for the message-passing layer: territory i's neighbors
// are neighbors[offsets[i] .. offsets[i+1]]. Constant per game.
export type EncodedAdjacency = {
  neighbors: Int32Array;
  offsets: Int32Array;
  numTerritories: number;
};

type PlayerStats = {
  totalDice: number;
  ownedCount: number;
  largestComponent: number;
  effectiveIncome: number;
};

/**
 * Single-pass per-player aggregates: total dice, owned cells, largest
 * connected component, effective end-of-turn income (capped by absorption
 * room across owned cells). One territory-graph traversal labels every
 * connected component once and tracks the per-owner largest, avoiding
 * NUM_PLAYERS separate BFS calls into largestComponent.
 */
function computePlayerStats(map: GameMap): PlayerStats[] {
  const N = map.territories.length;
  const totalDice = new Array<number>(NUM_PLAYERS).fill(0);
  const ownedCount = new Array<number>(NUM_PLAYERS).fill(0);
  const absorbCapacity = new Array<number>(NUM_PLAYERS).fill(0);
  const largest = new Array<number>(NUM_PLAYERS).fill(0);

  for (const t of map.territories) {
    totalDice[t.ownerId] += t.dice;
    ownedCount[t.ownerId]++;
    absorbCapacity[t.ownerId] += MAX_DICE_PER_TERRITORY - t.dice;
  }

  const visited = new Uint8Array(N);
  const stack: number[] = [];
  for (let start = 0; start < N; start++) {
    if (visited[start]) continue;
    const owner = map.territories[start].ownerId;
    let size = 0;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      size++;
      const neighbors = map.adjacency.get(cur);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (visited[n]) continue;
        if (map.territories[n].ownerId !== owner) continue;
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (size > largest[owner]) largest[owner] = size;
  }

  const stats: PlayerStats[] = [];
  for (let p = 0; p < NUM_PLAYERS; p++) {
    stats.push({
      totalDice: totalDice[p],
      ownedCount: ownedCount[p],
      largestComponent: largest[p],
      effectiveIncome: Math.min(largest[p], absorbCapacity[p]),
    });
  }
  return stats;
}

/**
 * Total size of same-owner pieces cut off if this cell is removed. Zero when
 * removing the cell doesn't split its component (i.e. it's not an articulation
 * point within owner's subgraph).
 */
function amputationCost(
  map: GameMap,
  territoryId: number,
  ownerId: number,
): number {
  const neighbors = map.adjacency.get(territoryId);
  if (!neighbors) return 0;

  const visited = new Set<number>([territoryId]);
  const pieces: number[] = [];

  for (const start of neighbors) {
    if (visited.has(start)) continue;
    if (map.territories[start].ownerId !== ownerId) continue;

    let size = 0;
    const stack: number[] = [start];
    visited.add(start);
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      size++;
      const ns = map.adjacency.get(cur);
      if (!ns) continue;
      for (const n of ns) {
        if (visited.has(n)) continue;
        if (map.territories[n].ownerId !== ownerId) continue;
        visited.add(n);
        stack.push(n);
      }
    }
    pieces.push(size);
  }

  if (pieces.length <= 1) return 0;
  pieces.sort((a, b) => b - a);
  let cutOff = 0;
  for (let i = 1; i < pieces.length; i++) cutOff += pieces[i];
  return cutOff;
}

/**
 * Build the per-state input for the network: per-territory feature rows
 * (owner-relative power + broadcast owner strengths) and a global block
 * (predation-style enemy summary, turn index). Layout is documented at
 * the top of this file alongside FEATURES_PER_TERRITORY / GLOBAL_FEATURES.
 */
export function encodeBoard(
  map: GameMap,
  actingPlayerId: number,
  turnIndex: number,
): EncodedBoard {
  const N = map.territories.length;
  const stats = computePlayerStats(map);

  const totalDice = stats.reduce((s, p) => s + p.totalDice, 0) || 1;
  const maxDiceTotal = N * MAX_DICE_PER_TERRITORY;

  let enemiesCounted = 0;
  let playersRemaining = 0;
  let maxEnemyStrength = 0;
  let minEnemyStrength = Number.POSITIVE_INFINITY;
  let sumEnemyStrength = 0;

  for (let p = 0; p < NUM_PLAYERS; p++) {
    if (stats[p].ownedCount === 0) continue;
    playersRemaining++;
    if (p === actingPlayerId) continue;
    const strength = stats[p].effectiveIncome / N;
    enemiesCounted++;
    sumEnemyStrength += strength;
    if (strength > maxEnemyStrength) maxEnemyStrength = strength;
    if (strength < minEnemyStrength) minEnemyStrength = strength;
  }
  if (enemiesCounted === 0) minEnemyStrength = 0;
  const meanEnemyStrength =
    enemiesCounted === 0 ? 0 : sumEnemyStrength / enemiesCounted;

  const perTerritory = new Float32Array(N * FEATURES_PER_TERRITORY);
  let frontierEdges = 0;

  for (let i = 0; i < N; i++) {
    const t = map.territories[i];
    const owner = t.ownerId;
    const ownerStats = stats[owner];
    const neighbors = map.adjacency.get(i);

    let friendlySum = 0;
    let enemySum = 0;
    let maxEnemy = 0;
    let enemyCount = 0;
    let hasFrontier = false;
    let holdingProb = 1;
    let bestOutbound = 0;

    if (neighbors) {
      for (const nIdx of neighbors) {
        const n = map.territories[nIdx];
        if (n.ownerId === owner) {
          friendlySum += n.dice;
        } else {
          hasFrontier = true;
          enemySum += n.dice;
          enemyCount++;
          if (n.dice > maxEnemy) maxEnemy = n.dice;
          holdingProb *= 1 - winProbability(n.dice, t.dice);
          if (t.dice >= 2) {
            const ob = winProbability(t.dice, n.dice);
            if (ob > bestOutbound) bestOutbound = ob;
          }
          if (nIdx > i) frontierEdges++;
        }
      }
    }

    const amputation = amputationCost(map, i, owner);

    let off = i * FEATURES_PER_TERRITORY;
    perTerritory[off++] = t.dice / MAX_DICE_PER_TERRITORY;
    perTerritory[off++] = owner === actingPlayerId ? 1 : 0;
    perTerritory[off++] = hasFrontier ? 1 : 0;
    perTerritory[off++] = friendlySum / 48;
    perTerritory[off++] = enemySum / 48;
    perTerritory[off++] = maxEnemy / MAX_DICE_PER_TERRITORY;
    perTerritory[off++] = enemyCount / 6;
    perTerritory[off++] = (t.dice - maxEnemy) / MAX_DICE_PER_TERRITORY;
    perTerritory[off++] = holdingProb;
    perTerritory[off++] = bestOutbound;
    perTerritory[off++] = amputation / N;
    perTerritory[off++] = ownerStats.largestComponent / N;
    perTerritory[off++] = ownerStats.totalDice / totalDice;
    perTerritory[off++] = ownerStats.effectiveIncome / N;
  }

  const global = new Float32Array(GLOBAL_FEATURES);
  global[0] = playersRemaining / NUM_PLAYERS;
  global[1] = totalDice / maxDiceTotal;
  global[2] = frontierEdges / (N * 3);
  global[3] = maxEnemyStrength;
  global[4] = meanEnemyStrength;
  global[5] = minEnemyStrength;
  global[6] = Math.min(turnIndex / 250, 1);

  const actorStats = stats[actingPlayerId];
  global[7] = actorStats.largestComponent / N;
  global[8] = actorStats.totalDice / totalDice;
  global[9] = actorStats.ownedCount / N;
  global[10] = actorStats.effectiveIncome / N;

  return { perTerritory, global };
}

/**
 * Encode the territory adjacency graph as CSR arrays (neighbors + offsets).
 * Independent of game state, computed once per map and reused across all
 * encoded boards from that map.
 */
export function encodeAdjacency(map: GameMap): EncodedAdjacency {
  const N = map.territories.length;
  const offsets = new Int32Array(N + 1);
  const list: number[] = [];
  for (let i = 0; i < N; i++) {
    offsets[i] = list.length;
    const ns = map.adjacency.get(i);
    if (ns) {
      for (const n of ns) list.push(n);
    }
  }
  offsets[N] = list.length;
  return {
    neighbors: Int32Array.from(list),
    offsets,
    numTerritories: N,
  };
}
