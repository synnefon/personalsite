/* eslint-disable no-console */
/**
 * Archetype round-robin tournament. Each game has all 7 archetypes
 * randomly assigned to seats; we track wins per archetype across N
 * games to measure relative strength in a mixed-population matchup.
 *
 * Parallelized via worker pool — same pattern as data collection in
 * train.ts. Use `WOTD_WORKERS=1` to force single-threaded for debugging.
 */
import * as os from "os";
import * as path from "path";
import { Worker } from "worker_threads";
import { NUM_PLAYERS } from "../constants.ts";
import type { ModelWeights } from "../model/forward.ts";
import { ARCHETYPE_IDS, type ArchetypeId } from "../model/personalities.ts";
import {
  policyFromArchetype,
  runOneGame,
  type Policy,
} from "./selfPlay.ts";
import {
  envNumber,
  loadCheckpointWeights,
  makeRng,
  runMain,
  shuffleInPlace,
  wilson95,
} from "./util.ts";

const DEFAULT_NUM_GAMES = 100;

/**
 * Hard cap on each worker isolate's V8 old-generation size. Under high
 * allocation rate V8 hoards old-space pages and won't release them; this
 * cap forces aggressive GC and keeps total RSS bounded at roughly
 * `WORKER_MAX_OLD_GEN_MB × WOTD_WORKERS`. Tune down to use less memory
 * (at the cost of more GC pauses), up for fewer pauses at higher RSS.
 */
const WORKER_MAX_OLD_GEN_MB = 384;

type GameOutcome = {
  winnerArch: ArchetypeId;
  rounds: number;
  cacheHits: number;
  cacheMisses: number;
};

type WorkerMessage =
  | { type: "ready" }
  | {
      type: "done";
      winnerArch: ArchetypeId;
      rounds: number;
      cacheHits: number;
      cacheMisses: number;
    }
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

    // `--expose-gc` (for global.gc() between games) must be passed at the
    // parent-process level via NODE_OPTIONS — not allowed in execArgv.
    // Memory cap (`WORKER_MAX_OLD_GEN_MB`) goes via resourceLimits.
    for (let w = 0; w < effectiveWorkers; w++) {
      const worker = new Worker(workerPath, {
        workerData: { weights },
        resourceLimits: { maxOldGenerationSizeMb: WORKER_MAX_OLD_GEN_MB },
      });
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
          outcomes.push({
            winnerArch: msg.winnerArch,
            rounds: msg.rounds,
            cacheHits: msg.cacheHits,
            cacheMisses: msg.cacheMisses,
          });
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
      (a): Policy => policyFromArchetype(weights, a),
    );
    const result = runOneGame(
      policies,
      undefined,
      undefined,
      rng,
      /* recordSamples */ false,
    );
    outcomes.push({
      winnerArch: assignment[result.winner],
      rounds: result.rounds,
      cacheHits: result.cacheHits,
      cacheMisses: result.cacheMisses,
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

  const weights: ModelWeights = loadCheckpointWeights({
    override: process.env.WOTD_CKPT,
    ckptDir: path.resolve(__dirname, "checkpoints"),
    candidates: ["value-latest.json"],
  });

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
  let totalHits = 0;
  let totalMisses = 0;
  for (const o of outcomes) {
    wins.set(o.winnerArch, (wins.get(o.winnerArch) ?? 0) + 1);
    totalRounds += o.rounds;
    totalHits += o.cacheHits;
    totalMisses += o.cacheMisses;
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
  const lookups = totalHits + totalMisses;
  if (lookups > 0) {
    const hitRate = (totalHits / lookups) * 100;
    console.log(
      `\nV-cache: ${totalHits.toLocaleString()} hits / ${lookups.toLocaleString()} lookups (${hitRate.toFixed(1)}%)`,
    );
  }
}

runMain(main);
