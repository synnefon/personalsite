/* eslint-disable no-console */
import * as fs from "fs";
import * as path from "path";
import { NUM_PLAYERS } from "../constants.ts";
import {
  greedyNeuralPolicy,
  linearPolicy,
  runOneGameWithPolicy,
  type Policy,
} from "./selfPlay.ts";
import { deserializeWeights } from "./tfModel.ts";

const DEFAULT_NUM_GAMES = 100;
const DEFAULT_NN_SEATS = 3;

/**
 * Resolve the checkpoint path to load. WOTD_CKPT > selfPlay-latest.json >
 * warmStart.json. Throws if none of them exist.
 */
function resolveCheckpointPath(): string {
  if (process.env.WOTD_CKPT) {
    return path.resolve(process.env.WOTD_CKPT);
  }
  const ckptDir = path.resolve(__dirname, "checkpoints");
  const latest = path.join(ckptDir, "selfPlay-latest.json");
  const warmStart = path.join(ckptDir, "warmStart.json");
  if (fs.existsSync(latest)) return latest;
  if (fs.existsSync(warmStart)) return warmStart;
  throw new Error(
    `no checkpoint found in ${ckptDir}; run wotd:warmstart first`,
  );
}

/**
 * Pick `count` distinct random integers from [0, NUM_PLAYERS) without
 * replacement. Used to decide which seats the NN takes in a given game.
 */
function pickRandomSeats(count: number): Set<number> {
  const pool: number[] = [];
  for (let i = 0; i < NUM_PLAYERS; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return new Set(pool.slice(0, count));
}

/**
 * Multi-game tournament where each game randomly assigns `nnSeats` seats
 * to the NN policy and the rest to the linear policy. Reports per-seat
 * win rates so NN-vs-linear is directly comparable inside identical games.
 */
async function main(): Promise<void> {
  const numGames = Number(process.env.WOTD_GAMES ?? DEFAULT_NUM_GAMES);
  const numNNSeats = Number(process.env.WOTD_NN_SEATS ?? DEFAULT_NN_SEATS);

  if (numNNSeats < 0 || numNNSeats > NUM_PLAYERS) {
    throw new Error(
      `WOTD_NN_SEATS must be in [0, ${NUM_PLAYERS}]; got ${numNNSeats}`,
    );
  }

  const ckptPath = resolveCheckpointPath();
  console.log(`loading weights from ${ckptPath}`);
  const raw = JSON.parse(fs.readFileSync(ckptPath, "utf8"));
  const weights = deserializeWeights(raw);
  const nnPolicy = greedyNeuralPolicy(weights);

  console.log(
    `eval: ${numGames} games, ${numNNSeats} NN seats vs ${
      NUM_PLAYERS - numNNSeats
    } linear seats`,
  );

  let nnSeatPlays = 0;
  let nnSeatWins = 0;
  let linSeatPlays = 0;
  let linSeatWins = 0;
  let nnSeatRounds = 0;
  let nnGameRounds = 0;

  const t0 = Date.now();
  for (let g = 0; g < numGames; g++) {
    const nnSeats = pickRandomSeats(numNNSeats);
    const policies: Policy[] = [];
    for (let i = 0; i < NUM_PLAYERS; i++) {
      policies.push(nnSeats.has(i) ? nnPolicy : linearPolicy());
    }
    const result = runOneGameWithPolicy(policies);

    nnSeatPlays += numNNSeats;
    linSeatPlays += NUM_PLAYERS - numNNSeats;
    if (nnSeats.has(result.winner)) {
      nnSeatWins++;
    } else {
      linSeatWins++;
    }
    nnGameRounds += result.rounds;
    nnSeatRounds += result.rounds;

    if ((g + 1) % 10 === 0) {
      console.log(`  ${g + 1}/${numGames} games`);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const nnRate = nnSeatPlays > 0 ? nnSeatWins / nnSeatPlays : 0;
  const linRate = linSeatPlays > 0 ? linSeatWins / linSeatPlays : 0;
  const baselineRate = 1 / NUM_PLAYERS;

  console.log(`\nresults (${elapsed}s, ${(nnGameRounds / numGames).toFixed(1)} rounds/game avg):`);
  console.log(
    `  NN seats:     ${nnSeatWins} wins / ${nnSeatPlays} seat-plays = ${(nnRate * 100).toFixed(1)}%`,
  );
  console.log(
    `  Linear seats: ${linSeatWins} wins / ${linSeatPlays} seat-plays = ${(linRate * 100).toFixed(1)}%`,
  );
  console.log(`  Random baseline (1/${NUM_PLAYERS}):       ${(baselineRate * 100).toFixed(1)}%`);
  if (linRate > 0) {
    console.log(`  NN / Linear ratio:                ${(nnRate / linRate).toFixed(2)}x`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
