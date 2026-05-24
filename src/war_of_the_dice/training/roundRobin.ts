/* eslint-disable no-console */
/**
 * Archetype round-robin tournament. Each game has all 7 archetypes
 * randomly assigned to seats; we track wins per archetype across N
 * games to measure relative strength in a mixed-population matchup.
 *
 * Parallelized via worker pool — same pattern as data collection in
 * train.ts. Use `WOTD_WORKERS=1` to force single-threaded for debugging.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Worker } from "worker_threads";
import { NUM_PLAYERS } from "../constants.ts";
import type { ModelWeights } from "../model/forward.ts";
import { ARCHETYPE_IDS, type ArchetypeId } from "../model/personalities.ts";
import { selectBestAttackForArchetype } from "../model/policy.ts";
import { runOneGame, type Policy } from "./selfPlay.ts";
import { deserializeWeights } from "./tfModel.ts";
import {
  envNumber,
  makeRng,
  resolveCheckpoint,
  runMain,
  shuffleInPlace,
} from "./util.ts";

const DEFAULT_NUM_GAMES = 100;

/** Wilson 95% binomial CI. */
function wilson95(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

type GameOutcome = { winnerArch: ArchetypeId; rounds: number };

type WorkerMessage =
  | { type: "ready" }
  | { type: "done"; winnerArch: ArchetypeId; rounds: number }
  | { type: "error"; error: string };

/** Parallel execution via worker pool. Drains numGames across numWorkers. */
function runGamesParallel(
  weights: ModelWeights,
  numGames: number,
  numWorkers: number,
  onGameDone: (g: number) => void,
): Promise<GameOutcome[]> {
  const workerPath = path.resolve(__dirname, "roundRobinWorker.js");
  const effectiveWorkers = Math.min(numWorkers, numGames);

  return new Promise<GameOutcome[]>((resolve, reject) => {
    const workers: Worker[] = [];
    const outcomes: GameOutcome[] = [];
    let dispatched = 0;
    let completed = 0;
    let settled = false;

    const fail = (e: unknown): void => {
      if (settled) return;
      settled = true;
      for (const w of workers) w.terminate();
      reject(e);
    };

    const dispatchNext = (worker: Worker): void => {
      if (dispatched < numGames) {
        dispatched++;
        worker.postMessage({ type: "job" });
      } else {
        worker.postMessage({ type: "shutdown" });
      }
    };

    for (let w = 0; w < effectiveWorkers; w++) {
      const worker = new Worker(workerPath, { workerData: { weights } });
      workers.push(worker);
      worker.on("message", (msg: WorkerMessage) => {
        if (msg.type === "ready") {
          dispatchNext(worker);
          return;
        }
        if (msg.type === "error") {
          fail(new Error(msg.error));
          return;
        }
        if (msg.type === "done") {
          outcomes.push({ winnerArch: msg.winnerArch, rounds: msg.rounds });
          completed++;
          onGameDone(completed);
          if (completed === numGames) {
            if (settled) return;
            settled = true;
            for (const w2 of workers) w2.postMessage({ type: "shutdown" });
            resolve(outcomes);
          } else {
            dispatchNext(worker);
          }
        }
      });
      worker.on("error", fail);
      worker.on("exit", (code) => {
        if (code !== 0 && !settled) {
          fail(new Error(`worker exited with code ${code}`));
        }
      });
    }
  });
}

/** Single-threaded fallback (and for WOTD_WORKERS=1). */
function runGamesSerial(
  weights: ModelWeights,
  numGames: number,
  rng: () => number,
  onGameDone: (g: number) => void,
): GameOutcome[] {
  const outcomes: GameOutcome[] = [];
  for (let g = 0; g < numGames; g++) {
    const assignment = ARCHETYPE_IDS.slice();
    shuffleInPlace(assignment as ArchetypeId[], rng);
    const policies: Policy[] = assignment.map(
      (archetype): Policy => (ctx) =>
        selectBestAttackForArchetype(
          ctx.map,
          ctx.playerId,
          ctx.turnIndex,
          ctx.adjacency,
          weights,
          archetype,
          ctx.recentAttackers,
          undefined,
          ctx.legalMoves,
        ),
    );
    const result = runOneGame(policies, undefined, undefined, rng);
    outcomes.push({
      winnerArch: assignment[result.winner],
      rounds: result.rounds,
    });
    onGameDone(g + 1);
  }
  return outcomes;
}

async function main(): Promise<void> {
  const numGames = envNumber("WOTD_GAMES", DEFAULT_NUM_GAMES);
  const rng = makeRng(process.env.WOTD_SEED);
  const numWorkers = envNumber(
    "WOTD_WORKERS",
    Math.max(1, os.cpus().length - 1),
  );

  if (NUM_PLAYERS !== ARCHETYPE_IDS.length) {
    throw new Error(
      `round-robin assumes NUM_PLAYERS (${NUM_PLAYERS}) === archetypes (${ARCHETYPE_IDS.length})`,
    );
  }

  const ckptPath = resolveCheckpoint({
    override: process.env.WOTD_CKPT,
    ckptDir: path.resolve(__dirname, "checkpoints"),
    candidates: ["value-latest.json"],
  });
  console.log(`loading weights from ${ckptPath}`);
  const raw = JSON.parse(fs.readFileSync(ckptPath, "utf8"));
  const weights: ModelWeights = deserializeWeights(raw);

  const parallel = numWorkers > 1;
  console.log(
    `round-robin: ${numGames} games, ${parallel ? `${numWorkers} workers` : "single-threaded"}, all 7 archetypes randomly seated per game`,
  );

  const progress = (g: number): void => {
    if (g % 10 === 0 || g === numGames) {
      console.log(`  ${g}/${numGames} games`);
    }
  };

  const t0 = Date.now();
  const outcomes = parallel
    ? await runGamesParallel(weights, numGames, numWorkers, progress)
    : runGamesSerial(weights, numGames, rng, progress);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const wins = new Map<ArchetypeId, number>();
  for (const a of ARCHETYPE_IDS) wins.set(a, 0);
  let totalRounds = 0;
  for (const o of outcomes) {
    wins.set(o.winnerArch, (wins.get(o.winnerArch) ?? 0) + 1);
    totalRounds += o.rounds;
  }

  const ranked = [...ARCHETYPE_IDS].sort(
    (a, b) => (wins.get(b) ?? 0) - (wins.get(a) ?? 0),
  );
  const baselineRate = 1 / NUM_PLAYERS;

  console.log(
    `\nresults (${elapsed}s, ${(totalRounds / numGames).toFixed(1)} rounds/game avg):`,
  );
  for (const arch of ranked) {
    const w = wins.get(arch) ?? 0;
    const rate = w / numGames;
    const [lo, hi] = wilson95(w, numGames);
    const baselineDelta = (rate - baselineRate) * 100;
    const sign = baselineDelta >= 0 ? "+" : "";
    console.log(
      `  ${(arch as string).padEnd(12)} ${w.toString().padStart(4)}/${numGames}  ${(rate * 100).toFixed(1)}%  CI [${(lo * 100).toFixed(1)}%, ${(hi * 100).toFixed(1)}%]  (${sign}${baselineDelta.toFixed(1)}pp vs baseline)`,
    );
  }
  console.log(
    `  baseline 1/${NUM_PLAYERS}:    ${(baselineRate * 100).toFixed(1)}%`,
  );
}

runMain(main);
