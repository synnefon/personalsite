/* eslint-disable no-console */
import * as fs from "fs";
import * as path from "path";
import { NUM_PLAYERS } from "../constants.ts";
import type { ModelWeights } from "../model/forward.ts";
import {
  defaultColorPersonality,
  type PersonalityId,
} from "../model/personalities.ts";
import {
  greedyNeuralPolicy,
  linearPolicy,
  runOneGameWithPolicy,
  type Policy,
} from "./selfPlay.ts";
import { deserializeWeights } from "./tfModel.ts";
import {
  envNumber,
  makeRng,
  resolveCheckpoint,
  runMain,
  shuffleInPlace,
} from "./util.ts";

const DEFAULT_NUM_GAMES = 100;
const DEFAULT_NN_SEATS = 3;

/**
 * Pick `count` distinct random integers from [0, NUM_PLAYERS) without
 * replacement. Used to decide which seats the NN takes in a given game.
 */
function pickRandomSeats(count: number, rng: () => number): Set<number> {
  const pool: number[] = [];
  for (let i = 0; i < NUM_PLAYERS; i++) pool.push(i);
  shuffleInPlace(pool, rng);
  return new Set(pool.slice(0, count));
}

/**
 * Wilson 95% binomial CI for a proportion. More accurate than the normal
 * approximation when k is small or p is near 0/1. Returns [low, high].
 */
function wilson95(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt(p * (1 - p) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/**
 * Multi-game tournament where each game randomly assigns `nnSeats` seats
 * to the NN policy and the rest to the linear policy. Reports per-seat
 * win rates with Wilson 95% CIs so noise floor is visible at small N.
 */
async function main(): Promise<void> {
  const numGames = envNumber("WOTD_GAMES", DEFAULT_NUM_GAMES);
  const numNNSeats = envNumber("WOTD_NN_SEATS", DEFAULT_NN_SEATS);
  const rng = makeRng(process.env.WOTD_SEED);

  if (numNNSeats < 0 || numNNSeats > NUM_PLAYERS) {
    throw new Error(
      `WOTD_NN_SEATS must be in [0, ${NUM_PLAYERS}]; got ${numNNSeats}`,
    );
  }

  const ckptPath = resolveCheckpoint({
    override: process.env.WOTD_CKPT,
    ckptDir: path.resolve(__dirname, "checkpoints"),
    candidates: ["selfPlay-latest.json", "warmStart.json"],
  });
  console.log(`loading weights from ${ckptPath}`);
  const raw = JSON.parse(fs.readFileSync(ckptPath, "utf8"));
  const weights: ModelWeights = deserializeWeights(raw);
  // One NN policy shared across all seats; personality conditioning is
  // applied via the encoded board the runner builds with each seat's
  // personality.
  const nnPolicy: Policy = greedyNeuralPolicy(weights);

  console.log(
    `eval: ${numGames} games, ${numNNSeats} NN seats vs ${
      NUM_PLAYERS - numNNSeats
    } linear seats`,
  );

  let nnSeatPlays = 0;
  let nnSeatWins = 0;
  let linSeatPlays = 0;
  let linSeatWins = 0;
  let totalGameRounds = 0;

  const t0 = Date.now();
  for (let g = 0; g < numGames; g++) {
    const nnSeats = pickRandomSeats(numNNSeats, rng);
    const policies: Policy[] = [];
    const personalities: PersonalityId[] = [];
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (nnSeats.has(i)) {
        policies.push(nnPolicy);
        personalities.push(defaultColorPersonality(i));
      } else {
        policies.push(linearPolicy());
        // Linear seats ignore conditioning, but the encoder still needs a
        // valid personality. Use the default per-color so the encoding is
        // consistent with what's baked.
        personalities.push(defaultColorPersonality(i));
      }
    }
    const result = runOneGameWithPolicy(
      policies,
      personalities,
      undefined,
      undefined,
      rng,
    );

    nnSeatPlays += numNNSeats;
    linSeatPlays += NUM_PLAYERS - numNNSeats;
    if (nnSeats.has(result.winner)) {
      nnSeatWins++;
    } else {
      linSeatWins++;
    }
    totalGameRounds += result.rounds;

    if ((g + 1) % 10 === 0) {
      console.log(`  ${g + 1}/${numGames} games`);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const baselineRate = 1 / NUM_PLAYERS;
  const [nnLow, nnHigh] = wilson95(nnSeatWins, nnSeatPlays);
  const [linLow, linHigh] = wilson95(linSeatWins, linSeatPlays);
  const fmtPct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  const fmtCi = (low: number, high: number): string =>
    `[${fmtPct(low)}, ${fmtPct(high)}]`;

  console.log(
    `\nresults (${elapsed}s, ${(totalGameRounds / numGames).toFixed(1)} rounds/game avg):`,
  );
  console.log(
    `  NN seats:     ${nnSeatWins} wins / ${nnSeatPlays} seat-plays = ${fmtPct(
      nnSeatPlays === 0 ? 0 : nnSeatWins / nnSeatPlays,
    )}  95% CI ${fmtCi(nnLow, nnHigh)}`,
  );
  console.log(
    `  Linear seats: ${linSeatWins} wins / ${linSeatPlays} seat-plays = ${fmtPct(
      linSeatPlays === 0 ? 0 : linSeatWins / linSeatPlays,
    )}  95% CI ${fmtCi(linLow, linHigh)}`,
  );
  console.log(`  Random baseline (1/${NUM_PLAYERS}):       ${fmtPct(baselineRate)}`);
  if (linSeatPlays > 0 && linSeatWins > 0) {
    const ratio = (nnSeatWins / nnSeatPlays) / (linSeatWins / linSeatPlays);
    console.log(`  NN / Linear ratio:                ${ratio.toFixed(2)}x`);
  }
}

runMain(main);
