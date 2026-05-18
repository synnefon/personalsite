import { canAttack } from "./combat.ts";
import { MAX_DICE_PER_TERRITORY } from "./constants.ts";
import { largestComponent } from "./gameLogic.ts";
import type { GameMap } from "./types.ts";

// Probability mass function for the sum of `n` six-sided dice.
// pmf[i] = P(sum = i + n), so the array is offset by n.
function pmf(n: number): number[] {
  if (n === 0) return [1];
  if (n === 1) return [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6];
  const prev = pmf(n - 1);
  const out = new Array<number>(5 * n + 1).fill(0);
  for (let i = 0; i < prev.length; i++) {
    const v = prev[i];
    if (v === 0) continue;
    for (let f = 0; f < 6; f++) out[i + f] += v / 6;
  }
  return out;
}

// WIN_PROB[a][d] = P(sum of `a` six-sided dice >= sum of `d` six-sided dice).
// Attackers win ties, so the comparison is >=. Precomputed at module load
// for a, d in [0, MAX_DICE_PER_TERRITORY].
const WIN_PROB: number[][] = (() => {
  const N = MAX_DICE_PER_TERRITORY;
  const pmfs: number[][] = [];
  for (let n = 0; n <= N; n++) pmfs.push(pmf(n));
  const table: number[][] = [];
  for (let a = 0; a <= N; a++) {
    const row: number[] = [];
    for (let d = 0; d <= N; d++) {
      if (a === 0) {
        row.push(0);
        continue;
      }
      if (d === 0) {
        row.push(1);
        continue;
      }
      const pa = pmfs[a];
      const pd = pmfs[d];
      let p = 0;
      for (let i = 0; i < pa.length; i++) {
        const aP = pa[i];
        if (aP === 0) continue;
        const aSum = i + a;
        for (let j = 0; j < pd.length; j++) {
          const dP = pd[j];
          if (dP === 0) continue;
          if (aSum >= j + d) p += aP * dP;
        }
      }
      row.push(p);
    }
    table.push(row);
  }
  return table;
})();

export function winProbability(attackerDice: number, defenderDice: number): number {
  return WIN_PROB[attackerDice]?.[defenderDice] ?? 0;
}

function simulateCapture(map: GameMap, sourceId: number, targetId: number): GameMap {
  const newTerritories = map.territories.map((t) => ({ ...t }));
  const sourceDice = newTerritories[sourceId].dice;
  newTerritories[targetId].ownerId = newTerritories[sourceId].ownerId;
  newTerritories[targetId].dice = sourceDice - 1;
  newTerritories[sourceId].dice = 1;
  return { ...map, territories: newTerritories };
}

function totalEnemyDiceAdjacent(
  map: GameMap,
  territoryId: number,
  ownerId: number
): number {
  const neighbors = map.adjacency.get(territoryId);
  if (!neighbors) return 0;
  let total = 0;
  for (const n of neighbors) {
    const nT = map.territories[n];
    if (nT.ownerId !== ownerId) total += nT.dice;
  }
  return total;
}

// Hard-mode evaluator weights. Tuned empirically; the component-size terms
// dominate because they drive reinforcement income.
export type AIPersonality = {
  weightWin: number;
  weightMyComponent: number;
  weightTheirComponent: number;
  weightExposure: number;
  scoreThreshold: number;
};

const BASE_PERSONALITY: AIPersonality = {
  weightWin: 1.0,
  weightMyComponent: 0.6,
  weightTheirComponent: 0.35,
  weightExposure: 0.04,
  scoreThreshold: 0.45,
};

export const PERSONALITY_JITTER = 0.15;

// Each AI gets its weights nudged independently by ±`amount` (uniform), so
// no two opponents play exactly the same way across a single game.
export function makePersonality(
  rng: () => number = Math.random,
  amount: number = PERSONALITY_JITTER
): AIPersonality {
  const jitter = (base: number): number =>
    base * (1 + (rng() * 2 - 1) * amount);
  return {
    weightWin: jitter(BASE_PERSONALITY.weightWin),
    weightMyComponent: jitter(BASE_PERSONALITY.weightMyComponent),
    weightTheirComponent: jitter(BASE_PERSONALITY.weightTheirComponent),
    weightExposure: jitter(BASE_PERSONALITY.weightExposure),
    scoreThreshold: jitter(BASE_PERSONALITY.scoreThreshold),
  };
}

export type AIMove = { sourceId: number; targetId: number };

export function selectBestAttack(
  map: GameMap,
  playerId: number,
  personality: AIPersonality = BASE_PERSONALITY
): AIMove | null {
  const myBefore = largestComponent(map, playerId);
  let bestMove: AIMove | null = null;
  let bestScore = -Infinity;

  for (let s = 0; s < map.territories.length; s++) {
    const source = map.territories[s];
    if (source.ownerId !== playerId) continue;
    if (source.dice < 2) continue;
    const neighbors = map.adjacency.get(s);
    if (!neighbors) continue;
    for (const t of neighbors) {
      if (!canAttack(map, s, t)) continue;
      const target = map.territories[t];
      const winProb = winProbability(source.dice, target.dice);
      const sim = simulateCapture(map, s, t);
      const myAfter = largestComponent(sim, playerId);
      const theirBefore = largestComponent(map, target.ownerId);
      const theirAfter = largestComponent(sim, target.ownerId);
      const exposure = totalEnemyDiceAdjacent(sim, t, playerId);

      const score =
        winProb * personality.weightWin +
        (myAfter - myBefore) * personality.weightMyComponent +
        (theirBefore - theirAfter) * personality.weightTheirComponent -
        exposure * personality.weightExposure;

      if (score > bestScore) {
        bestScore = score;
        bestMove = { sourceId: s, targetId: t };
      }
    }
  }

  if (!bestMove || bestScore < personality.scoreThreshold) return null;
  return bestMove;
}
