/* eslint-disable no-console */
/**
 * One-off diagnostic to calibrate per-archetype decision modifiers. Runs
 * NN-vs-linear games with the trained model, samples per-decision stats
 * across every NN decision, and prints distributions. The output guides
 * how to size threshold multipliers and Q biases for each archetype so
 * the modifications produce visible behavior changes without overwhelming
 * the value network's own signal.
 *
 * Quantities captured per NN decision:
 *   - q_pass, q_best_attack, q_gap (= q_best_attack − q_pass)
 *   - across all candidate attacks: winProb, Δ-largest-component (mine,
 *     pre vs post-attack-success), enemy hold probability (after capture,
 *     prob neighbors don't take it back)
 *   - target's owner's score (largest component), and rank of that score
 *     among all alive opponents
 *
 * Each distribution is summarized with count / mean / std / quantiles.
 */
import * as path from "path";
import { winProbability } from "../diceMath.ts";
import {
  simulateAttackFail,
  simulateAttackSuccess,
  simulateReinforcement,
} from "../combat.ts";
import { NUM_PLAYERS } from "../constants.ts";
import { largestComponent } from "../gameLogic.ts";
import { type ModelWeights } from "../model/forward.ts";
import {
  captureHoldProb,
  rankAliveEnemies,
  selectBestAttackByValue,
  valueOf,
} from "../model/policy.ts";
import {
  runOneGame,
  type DecisionContext,
  type Policy,
} from "./selfPlay.ts";
import {
  envNumber,
  loadCheckpointWeights,
  makeRng,
  runMain,
} from "./util.ts";

const DEFAULT_NUM_GAMES = 30;

type Stats = {
  count: number;
  mean: number;
  std: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  max: number;
};

function summarize(xs: number[]): Stats {
  if (xs.length === 0) {
    return {
      count: 0,
      mean: 0,
      std: 0,
      min: 0,
      p10: 0,
      p50: 0,
      p90: 0,
      max: 0,
    };
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  let sq = 0;
  for (const x of sorted) sq += (x - mean) * (x - mean);
  const std = Math.sqrt(sq / sorted.length);
  const q = (p: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    count: sorted.length,
    mean,
    std,
    min: sorted[0],
    p10: q(0.1),
    p50: q(0.5),
    p90: q(0.9),
    max: sorted[sorted.length - 1],
  };
}

function printStats(label: string, s: Stats): void {
  if (s.count === 0) {
    console.log(`  ${label}: (no samples)`);
    return;
  }
  console.log(
    `  ${label.padEnd(32)} n=${s.count.toString().padStart(6)} mean=${s.mean.toFixed(4).padStart(8)} std=${s.std.toFixed(4).padStart(8)} [${s.min.toFixed(3)} | ${s.p10.toFixed(3)} → ${s.p50.toFixed(3)} → ${s.p90.toFixed(3)} | ${s.max.toFixed(3)}]`,
  );
}

/** Per-decision sample. */
type DecisionSample = {
  qPass: number;
  qBestAttack: number;
  qGap: number; // qBestAttack - qPass
  chosenWinProb: number; // winProb of the attack we'd take (or 0 if pass)
  // Per candidate stats (multiple per decision)
  candidateWinProbs: number[];
  candidateDeltaLargest: number[];
  candidateHoldProb: number[];
  candidateTargetOwnerScore: number[]; // largest_component of target's owner pre-attack
  candidateTargetOwnerRankFromLow: number[]; // 0 = weakest, NUM_PLAYERS-2 = strongest
};

function captureStats(
  ctx: DecisionContext,
  weights: ModelWeights,
  turnIndex: number,
): DecisionSample {
  const { map, playerId, adjacency, legalMoves } = ctx;

  // Q(pass) and Q(attack) — match what policy.ts does
  const reinforcedCurrent = simulateReinforcement(map, playerId);
  const qPass = valueOf(
    reinforcedCurrent,
    playerId,
    turnIndex,
    adjacency,
    weights,
  );

  const { playerScores, rankFromLow } = rankAliveEnemies(map, playerId);

  const myLargestPre = largestComponent(map, playerId);

  const candidateWinProbs: number[] = [];
  const candidateDeltaLargest: number[] = [];
  const candidateHoldProb: number[] = [];
  const candidateTargetOwnerScore: number[] = [];
  const candidateTargetOwnerRankFromLow: number[] = [];

  let qBestAttack = -Infinity;
  let bestAttackWp = 0;
  for (const m of legalMoves) {
    const wp = winProbability(
      map.territories[m.sourceId].dice,
      map.territories[m.targetId].dice,
    );
    const successMap = simulateAttackSuccess(map, m.sourceId, m.targetId);
    const myLargestPost = largestComponent(successMap, playerId);
    const dLargest = myLargestPost - myLargestPre;
    const holdProb = captureHoldProb(successMap, m.targetId, playerId);

    const reinforcedSuccess = simulateReinforcement(successMap, playerId);
    const reinforcedFail = simulateReinforcement(
      simulateAttackFail(map, m.sourceId, m.targetId),
      playerId,
    );
    const vSuccess = valueOf(
      reinforcedSuccess,
      playerId,
      turnIndex,
      adjacency,
      weights,
    );
    const vFail = valueOf(
      reinforcedFail,
      playerId,
      turnIndex,
      adjacency,
      weights,
    );
    const q = wp * vSuccess + (1 - wp) * vFail;

    if (q > qBestAttack) {
      qBestAttack = q;
      bestAttackWp = wp;
    }

    const targetOwner = map.territories[m.targetId].ownerId;
    candidateWinProbs.push(wp);
    candidateDeltaLargest.push(dLargest);
    candidateHoldProb.push(holdProb);
    candidateTargetOwnerScore.push(playerScores[targetOwner]);
    candidateTargetOwnerRankFromLow.push(rankFromLow.get(targetOwner) ?? -1);
  }

  return {
    qPass,
    qBestAttack,
    qGap: qBestAttack - qPass,
    chosenWinProb: bestAttackWp,
    candidateWinProbs,
    candidateDeltaLargest,
    candidateHoldProb,
    candidateTargetOwnerScore,
    candidateTargetOwnerRankFromLow,
  };
}

/**
 * Wraps the greedy V-policy to also record per-decision stats. The
 * recorded snapshot is what an archetype modifier would see at decision
 * time, so the distributions describe the design space directly.
 */
function instrumentedValuePolicy(
  weights: ModelWeights,
  samples: DecisionSample[],
  turnIndexRef: { round: number },
): Policy {
  return (ctx) => {
    if (ctx.legalMoves.length === 0) return null;
    samples.push(captureStats(ctx, weights, turnIndexRef.round));
    return selectBestAttackByValue(
      ctx.map,
      ctx.playerId,
      turnIndexRef.round,
      ctx.adjacency,
      weights,
      ctx.legalMoves,
    );
  };
}

async function main(): Promise<void> {
  const numGames = envNumber("WOTD_CALIBRATE_GAMES", DEFAULT_NUM_GAMES);
  const rng = makeRng(process.env.WOTD_SEED);

  const weights: ModelWeights = loadCheckpointWeights({
    override: process.env.WOTD_CKPT,
    ckptDir: path.resolve(__dirname, "checkpoints"),
    candidates: ["value-latest.json"],
  });

  const samples: DecisionSample[] = [];
  const turnIndexRef = { round: 0 };

  // All seats use the instrumented NN — mirror-match calibration mirrors
  // the real round-robin setup where every seat is NN.
  for (let g = 0; g < numGames; g++) {
    const policies: Policy[] = Array.from({ length: NUM_PLAYERS }, () =>
      instrumentedValuePolicy(weights, samples, turnIndexRef),
    );
    runOneGame(policies, undefined, undefined, rng);
  }

  console.log(
    `\ncalibration summary: ${samples.length} NN decisions across ${numGames} games\n`,
  );

  console.log("== per-decision aggregates ==");
  printStats("q_pass", summarize(samples.map((s) => s.qPass)));
  printStats("q_best_attack", summarize(samples.map((s) => s.qBestAttack)));
  printStats(
    "q_gap (best_attack - pass)",
    summarize(samples.map((s) => s.qGap)),
  );
  printStats(
    "chosen winProb (best attack)",
    summarize(samples.map((s) => s.chosenWinProb)),
  );

  // Flatten candidate-level distributions
  const flatWp: number[] = [];
  const flatDL: number[] = [];
  const flatHold: number[] = [];
  const flatTargetScore: number[] = [];
  const flatTargetRank: number[] = [];
  for (const s of samples) {
    flatWp.push(...s.candidateWinProbs);
    flatDL.push(...s.candidateDeltaLargest);
    flatHold.push(...s.candidateHoldProb);
    flatTargetScore.push(...s.candidateTargetOwnerScore);
    flatTargetRank.push(...s.candidateTargetOwnerRankFromLow);
  }
  console.log("\n== per-candidate-attack distributions ==");
  printStats("winProb", summarize(flatWp));
  printStats("Δ largest_component (success)", summarize(flatDL));
  printStats("capture hold probability", summarize(flatHold));
  printStats("target owner's score (LCC)", summarize(flatTargetScore));
  printStats("target rank from low (0=weakest)", summarize(flatTargetRank));

  // How often is the highest-Q attack the highest-winProb attack? (sanity)
  let bestQIsBestWp = 0;
  let totalDecisionsWithAttacks = 0;
  for (const s of samples) {
    if (s.candidateWinProbs.length === 0) continue;
    totalDecisionsWithAttacks++;
    const maxWp = Math.max(...s.candidateWinProbs);
    if (s.chosenWinProb >= maxWp - 1e-9) bestQIsBestWp++;
  }
  console.log(
    `\nbest-Q == best-winProb attack: ${bestQIsBestWp}/${totalDecisionsWithAttacks} (${((bestQIsBestWp / totalDecisionsWithAttacks) * 100).toFixed(1)}%)`,
  );
}

runMain(main);
