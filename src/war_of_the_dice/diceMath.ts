import { MAX_DICE_PER_TERRITORY } from "./constants.ts";

const ONE_SIXTH = 1 / 6;
const SINGLE_DIE_PMF = [
  ONE_SIXTH,
  ONE_SIXTH,
  ONE_SIXTH,
  ONE_SIXTH,
  ONE_SIXTH,
  ONE_SIXTH,
];

/**
 * Probability mass function for the sum of `n` six-sided dice. Indexed by
 * sum-offset: `pmf(n)[i] = P(sum = i + n)`. Length is `5n + 1` (offsets
 * `0..5n`, covering sums `n..6n`).
 *
 * Computed by convolving `pmf(n-1)` with the uniform 1-die distribution:
 * each (prev-offset, face) pair contributes `prev[i] * 1/6` to the offset
 * `i + face` of the result.
 */
function pmf(n: number): number[] {
  if (n === 0) return [1];
  if (n === 1) return SINGLE_DIE_PMF;
  const prev = pmf(n - 1);
  const out = new Array<number>(5 * n + 1).fill(0);
  for (let i = 0; i < prev.length; i++) {
    const v = prev[i];
    if (v === 0) continue;
    for (let face = 0; face < 6; face++) {
      out[i + face] += v * ONE_SIXTH;
    }
  }
  return out;
}

/**
 * `P(sum of a 6-sided dice >= sum of d 6-sided dice)`. Attackers win ties.
 * Brute-force convolution over the two pre-computed PMFs; called O(N²)
 * times at module load (N = MAX_DICE_PER_TERRITORY), then never again.
 */
function pairWinProb(a: number, d: number, pmfs: number[][]): number {
  // Boundary cases: zero attacker dice never wins; zero defender dice
  // always loses.
  if (a === 0) return 0;
  if (d === 0) return 1;

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
  return p;
}

// WIN_PROB[a][d] = P(attacker with `a` dice beats defender with `d` dice).
// Precomputed at module load for a, d ∈ [0, MAX_DICE_PER_TERRITORY].
// Runtime lookup is plain array indexing — winProbability() never recomputes.
const WIN_PROB: number[][] = (() => {
  const N = MAX_DICE_PER_TERRITORY;
  const pmfs = Array.from({ length: N + 1 }, (_, n) => pmf(n));
  return Array.from({ length: N + 1 }, (_, a) =>
    Array.from({ length: N + 1 }, (_, d) => pairWinProb(a, d, pmfs)),
  );
})();

/**
 * Precomputed lookup for P(`attackerDice` six-sided sum >= `defenderDice`
 * six-sided sum). Returns 0 for out-of-range inputs.
 */
export function winProbability(
  attackerDice: number,
  defenderDice: number,
): number {
  return WIN_PROB[attackerDice]?.[defenderDice] ?? 0;
}
