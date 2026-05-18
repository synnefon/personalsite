import { shuffle } from "../util/Random";
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

export function winProbability(
  attackerDice: number,
  defenderDice: number,
): number {
  return WIN_PROB[attackerDice]?.[defenderDice] ?? 0;
}

function simulateCapture(
  map: GameMap,
  sourceId: number,
  targetId: number,
): GameMap {
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
  ownerId: number,
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

// Hard-mode evaluator. Each AI gets its own personality — five knobs in
// [-1, 1] that shape how it ranks candidate attacks:
//   confidence — trusts the true P(attack succeeds) heavily
//   expansion  — values growing its own connected cluster
//   disruption — loves carving up opponents
//   caution    — avoids ending up exposed
//   pickiness  — passes on marginal attacks
// The knobs are stored normalized; selectBestAttack lerps each one against
// PERSONALITY_RANGE around its base weight when computing scores.
export type AIPersonality = {
  confidence: number;
  expansion: number;
  disruption: number;
  caution: number;
  pickiness: number;
};

const BASE_WEIGHTS = {
  confidence: 1.0,
  expansion: 0.6,
  disruption: 0.35,
  caution: 0.04,
  pickiness: 0.45,
} as const;

// At knob = ±1 the effective weight is base * (1 ± PERSONALITY_RANGE).
export const PERSONALITY_RANGE = 0.4;

export const NEUTRAL_PERSONALITY: AIPersonality = {
  confidence: 0,
  expansion: 0,
  disruption: 0,
  caution: 0,
  pickiness: 0,
};

// Each AI gets every knob drawn uniformly from [-1, 1].
export function makePersonality(
  rng: () => number = Math.random,
): AIPersonality {
  const draw = (): number => rng() * 2 - 1;
  return {
    confidence: draw(),
    expansion: draw(),
    disruption: draw(),
    caution: draw(),
    pickiness: draw(),
  };
}

function effective(base: number, knob: number): number {
  return base * (1 + knob * PERSONALITY_RANGE);
}

export type PersonalityBucket =
  | "VERY LOW"
  | "LOW"
  | "NEUTRAL"
  | "HIGH"
  | "VERY HIGH";

// Five evenly-spaced buckets across [-1, 1]. Display-only.
export function bucketKnob(v: number): PersonalityBucket {
  if (v < -0.6) return "VERY LOW";
  if (v < -0.2) return "LOW";
  if (v < 0.2) return "NEUTRAL";
  if (v < 0.6) return "HIGH";
  return "VERY HIGH";
}

export type AIMove = { sourceId: number; targetId: number };

export function selectBestAttack(
  map: GameMap,
  playerId: number,
  personality: AIPersonality = NEUTRAL_PERSONALITY,
): AIMove | null {
  const myBefore = largestComponent(map, playerId);
  const wConfidence = effective(
    BASE_WEIGHTS.confidence,
    personality.confidence,
  );
  const wExpansion = effective(BASE_WEIGHTS.expansion, personality.expansion);
  const wDisruption = effective(
    BASE_WEIGHTS.disruption,
    personality.disruption,
  );
  const wCaution = effective(BASE_WEIGHTS.caution, personality.caution);
  const threshold = effective(BASE_WEIGHTS.pickiness, personality.pickiness);

  let bestMove: AIMove | null = null;
  let bestScore = -Infinity;

  for (let s = 0; s < map.territories.length; s++) {
    const source = map.territories[s];
    if (source.ownerId !== playerId) continue;
    if (source.dice < 2) continue;
    const neighbors = map.adjacency.get(s);
    if (!neighbors) continue;
    const aNeighbors = shuffle(Array.from(neighbors));
    for (const t of aNeighbors) {
      if (!canAttack(map, s, t)) continue;
      const target = map.territories[t];
      const winProb = winProbability(source.dice, target.dice);
      const sim = simulateCapture(map, s, t);
      const myAfter = largestComponent(sim, playerId);
      const theirBefore = largestComponent(map, target.ownerId);
      const theirAfter = largestComponent(sim, target.ownerId);
      const exposure = totalEnemyDiceAdjacent(sim, t, playerId);

      const score =
        winProb * wConfidence +
        (myAfter - myBefore) * wExpansion +
        (theirBefore - theirAfter) * wDisruption -
        exposure * wCaution;

      if (score > bestScore) {
        bestScore = score;
        bestMove = { sourceId: s, targetId: t };
      }
    }
  }

  if (!bestMove || bestScore < threshold) return null;
  return bestMove;
}
