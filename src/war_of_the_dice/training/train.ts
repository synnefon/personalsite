/* eslint-disable no-console */
import * as tf from "@tensorflow/tfjs-node";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Worker } from "worker_threads";
import { NUM_PLAYERS } from "../constants.ts";
import { generateMap } from "../mapGenerator.ts";
import { encodeAdjacency, encodeBoard } from "../model/encoding.ts";
import type { ModelWeights } from "../model/forward.ts";
import { milestone } from "./progress.ts";
import {
  runOneGame,
  samplingValuePolicy,
  type Policy,
  type ValueSample,
} from "./selfPlay.ts";
import {
  adjacencyToMeanMatrix,
  applyWeights,
  buildTfModel,
  deserializeWeights,
  extractWeights,
  forwardEmbeddings,
  forwardScoreValue,
  serializeWeights,
  valueLoss,
  type TfModel,
} from "./tfModel.ts";
import {
  ensureDir,
  envNumber,
  makeRng,
  runMain,
  shuffleInPlace,
} from "./util.ts";

const DEFAULT_ROUNDS = 10;
const DEFAULT_GAMES_PER_ROUND = 30;
const DEFAULT_EPOCHS_PER_ROUND = 3;
const DEFAULT_LR = 5e-4;
const DEFAULT_BATCH_SIZE = 16;
const PARALLEL_THRESHOLD = 16;

// ---- per-round batch progress bar ----------------------------------------
// Bar resets to 0% at the start of every round and fills to 100% as that
// round's training batches complete. Denominator (batches in this round)
// is known exactly after collection: ceil(samples / batchSize) * epochs.

const PHASE_BAR_WIDTH = 12;

function makeBar(done: number, total: number): string {
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  const filled = Math.floor(pct * PHASE_BAR_WIDTH);
  return "█".repeat(filled) + "░".repeat(PHASE_BAR_WIDTH - filled);
}

function renderBars(
  round: number,
  totalRounds: number,
  collect: { done: number; total: number },
  train: { done: number; total: number },
): void {
  process.stdout.write(
    `\r\x1b[Kround ${round}/${totalRounds}  collect [${makeBar(
      collect.done,
      collect.total,
    )}] ${collect.done}/${collect.total}  train [${makeBar(
      train.done,
      train.total,
    )}] ${train.done}/${train.total}`,
  );
}

function clearBar(): void {
  process.stdout.write("\r\x1b[K");
}

// --------------------------------------------------------------------------

type SampleWithAdj = {
  sample: ValueSample;
  adjMatrix: tf.Tensor;
};

/**
 * Force every layer to build (and register trainable variables) before any
 * weight-loading. Uses a generated map for a real-shape dummy forward pass.
 */
function buildLayers(model: TfModel): void {
  const dummyMap = generateMap();
  const adjacency = encodeAdjacency(dummyMap);
  const board = encodeBoard(dummyMap, 0, 0);
  const adjMatrix = adjacencyToMeanMatrix(adjacency);
  tf.tidy(() => {
    const emb = forwardEmbeddings(model, board, adjMatrix);
    forwardScoreValue(model, emb);
  });
  adjMatrix.dispose();
}

type CollectConfig = {
  weights: ModelWeights;
  temp: number;
  lookaheadDepth: number;
};

/** Single-threaded self-play data collection. */
function collectGames(
  numGames: number,
  rng: () => number,
  config: CollectConfig,
  onGameDone: () => void,
): SampleWithAdj[] {
  const buildPolicies = (): Policy[] =>
    Array.from({ length: NUM_PLAYERS }, () =>
      samplingValuePolicy(
        config.weights,
        config.temp,
        rng,
        config.lookaheadDepth,
      ),
    );
  const out: SampleWithAdj[] = [];
  for (let g = 0; g < numGames; g++) {
    const result = runOneGame(buildPolicies(), undefined, undefined, rng);
    const adjMatrix = adjacencyToMeanMatrix(result.adjacency);
    for (const s of result.samples) {
      out.push({ sample: s, adjMatrix });
    }
    onGameDone();
  }
  return out;
}

type WorkerResult = {
  winner: number;
  rounds: number;
  completed: boolean;
  adjacency: ReturnType<typeof encodeAdjacency>;
  samples: ValueSample[];
};

type WorkerMessage = { type: "ready" } | { type: "done"; result: WorkerResult };

/**
 * Parallel data collection via worker pool. Workers send `ready` once
 * after boot, then alternate between accepting `job` messages and posting
 * `done` results. Each `done` arrival immediately triggers the next
 * dispatch (or shutdown if all games dispatched), so completions trickle
 * in at the natural per-game cadence — no synchronized bursts.
 */
function collectGamesParallel(
  numGames: number,
  numWorkers: number,
  config: CollectConfig,
  onGameDone: () => void,
): Promise<SampleWithAdj[]> {
  const workerPath = path.resolve(__dirname, "selfPlayWorker.js");
  const effectiveWorkers = Math.min(numWorkers, numGames);

  return new Promise<SampleWithAdj[]>((resolve, reject) => {
    const workers: Worker[] = [];
    const collected: WorkerResult[] = [];
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

    // Snapshot weights once per round, sent to every worker via structured
    // clone. Workers freeze on this policy for the entire round's games
    // (AlphaZero-style "freeze the policy, generate, train, repeat").
    const workerData = {
      weights: config.weights,
      temp: config.temp,
      lookaheadDepth: config.lookaheadDepth,
    };

    /** Wire message/error/exit handlers for a single worker. */
    const attachHandlers = (worker: Worker): void => {
      worker.on("message", (msg: WorkerMessage) => {
        if (msg.type === "ready") {
          dispatchNext(worker);
          return;
        }
        if (msg.type === "done") {
          collected.push(msg.result);
          completed++;
          onGameDone();
          if (completed === numGames) {
            if (settled) return;
            settled = true;
            for (const w2 of workers) w2.postMessage({ type: "shutdown" });
            const samples: SampleWithAdj[] = [];
            for (const r of collected) {
              const adjMatrix = adjacencyToMeanMatrix(r.adjacency);
              for (const s of r.samples) samples.push({ sample: s, adjMatrix });
            }
            resolve(samples);
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
    };

    for (let w = 0; w < effectiveWorkers; w++) {
      const worker = new Worker(workerPath, { workerData });
      workers.push(worker);
      attachHandlers(worker);
    }
  });
}

/** Dispose every unique adjMatrix in the sample set exactly once. */
function disposeAdjacencies(samples: ReadonlyArray<SampleWithAdj>): void {
  const seen = new Set<tf.Tensor>();
  for (const s of samples) {
    if (!seen.has(s.adjMatrix)) {
      seen.add(s.adjMatrix);
      s.adjMatrix.dispose();
    }
  }
}

/**
 * One pass over samples with BCE-on-value loss. Effective batch size = 1
 * per gradient step (per-sample forward pass), but `batchSize` samples are
 * accumulated into a single baseline.minimize call.
 */
async function trainOneEpoch(
  model: TfModel,
  baseline: tf.baseline,
  samples: SampleWithAdj[],
  batchSize: number,
  rng: () => number,
  onBatchDone: () => void,
): Promise<number> {
  shuffleInPlace(samples, rng);
  let totalLoss = 0;
  let totalSamples = 0;
  for (let start = 0; start < samples.length; start += batchSize) {
    const batch = samples.slice(start, start + batchSize);
    const lossTensor = baseline.minimize(() => {
      let sumLoss: tf.Tensor | null = null;
      for (const { sample, adjMatrix } of batch) {
        const sampleLoss = valueLoss(
          model,
          sample.board,
          adjMatrix,
          sample.win ? 1 : 0,
        );
        sumLoss = sumLoss === null ? sampleLoss : sumLoss.add(sampleLoss);
      }
      return sumLoss!.div(batch.length) as tf.Scalar;
    }, true) as tf.Scalar;
    totalLoss += (await lossTensor.data())[0] * batch.length;
    totalSamples += batch.length;
    lossTensor.dispose();
    onBatchDone();
  }
  return totalLoss / totalSamples;
}

/**
 * Quick NN-vs-linear sanity eval at end of each round. Invokes
 * `onGameDone()` per game for bar updates.
 */
/**
 * Top-level self-play training. Warm-starts from `value-latest.json`, then
 * each round generates games with all 7 seats using samplingValuePolicy
 * (current weights, temperature WOTD_SELFPLAY_TEMP, default 0.5). Trains
 * V on those. AlphaZero-style: freeze policy, generate games, train on
 * outcomes, repeat. Each round overwrites `value-latest.json` and saves
 * a per-round checkpoint.
 */
async function main(): Promise<void> {
  const rounds = envNumber("WOTD_ROUNDS", DEFAULT_ROUNDS);
  const gamesPerRound = envNumber("WOTD_GAMES", DEFAULT_GAMES_PER_ROUND);
  const epochsPerRound = envNumber("WOTD_EPOCHS", DEFAULT_EPOCHS_PER_ROUND);
  const lr = envNumber("WOTD_LR", DEFAULT_LR);
  const batchSize = envNumber("WOTD_BATCH", DEFAULT_BATCH_SIZE);
  const selfPlayTemp = envNumber("WOTD_SELFPLAY_TEMP", 0.5);
  const selfPlayLookahead = envNumber("WOTD_SELFPLAY_LOOKAHEAD", 3);
  const seed = process.env.WOTD_SEED;
  const rng = makeRng(seed);

  const useWorkers =
    gamesPerRound >= PARALLEL_THRESHOLD && process.env.WOTD_NO_WORKERS !== "1";
  const numWorkers = useWorkers ? Math.min(os.cpus().length, gamesPerRound) : 1;

  milestone(
    `self-play training: rounds=${rounds} games/round=${gamesPerRound} epochs/round=${epochsPerRound} lr=${lr} batch=${batchSize} temp=${selfPlayTemp} lookahead=${selfPlayLookahead}${seed ? ` seed=${seed}` : ""}`,
  );
  milestone(
    `data collection: ${useWorkers ? `${numWorkers} workers` : "single-threaded"}`,
  );

  const checkpointDir = path.resolve(__dirname, "checkpoints");
  ensureDir(checkpointDir);

  const model = buildTfModel();
  buildLayers(model);

  // Self-play needs a non-random baseline to generate meaningful games.
  // value-latest.json is the running training output that we overwrite
  // each round.
  const baseline = path.join(checkpointDir, "value-latest.json");
  if (!fs.existsSync(baseline)) {
    throw new Error(
      `self-play requires ${baseline}; no baseline checkpoint found`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(baseline, "utf8"));
  applyWeights(model, deserializeWeights(raw));
  milestone(`warm-started from ${path.basename(baseline)}`);

  const baseline = tf.train.adam(lr);

  // Initial empty bars for round 1. Training total is unknown until
  // first collection finishes, so it starts as 0/0 (renders empty).
  renderBars(
    1,
    rounds,
    { done: 0, total: gamesPerRound },
    { done: 0, total: 0 },
  );

  for (let round = 0; round < rounds; round++) {
    const t0 = Date.now();

    // Snapshot weights once per round; workers see this frozen policy for
    // the entire round's games.
    const config: CollectConfig = {
      weights: await extractWeights(model),
      temp: selfPlayTemp,
      lookaheadDepth: selfPlayLookahead,
    };

    const progress = { games: 0, batches: 0, batchesTotal: 0 };
    const draw = (): void =>
      renderBars(
        round + 1,
        rounds,
        { done: progress.games, total: gamesPerRound },
        { done: progress.batches, total: progress.batchesTotal },
      );
    draw();

    const onGameDone = (): void => {
      progress.games++;
      draw();
    };
    const samples = useWorkers
      ? await collectGamesParallel(
          gamesPerRound,
          numWorkers,
          config,
          onGameDone,
        )
      : collectGames(gamesPerRound, rng, config, onGameDone);

    const batchesPerEpoch = Math.ceil(samples.length / batchSize);
    progress.batchesTotal = batchesPerEpoch * epochsPerRound;
    draw();

    let lastLoss = 0;
    for (let ep = 0; ep < epochsPerRound; ep++) {
      lastLoss = await trainOneEpoch(
        model,
        baseline,
        samples,
        batchSize,
        rng,
        () => {
          progress.batches++;
          draw();
        },
      );
    }

    disposeAdjacencies(samples);

    // Bar's done. Spinner-style ellipsis while we extract weights and save
    // the checkpoint — these can take a few seconds, so an explicit "still
    // working" indicator beats a frozen 100%-full bar.
    clearBar();
    const summaryPrefix = `round ${round + 1}/${rounds} generating round summary`;
    let dots = "";
    process.stdout.write(summaryPrefix);
    const spinner = setInterval(() => {
      dots += ".";
      process.stdout.write(`\r\x1b[K${summaryPrefix}${dots}`);
    }, 1000);

    const finalWeights = await extractWeights(model);
    const ckptPath = path.join(
      checkpointDir,
      `value-${round.toString().padStart(3, "0")}.json`,
    );
    fs.writeFileSync(ckptPath, JSON.stringify(serializeWeights(finalWeights)));
    fs.writeFileSync(
      path.join(checkpointDir, "value-latest.json"),
      JSON.stringify(serializeWeights(finalWeights)),
    );

    clearInterval(spinner);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    clearBar();
    console.log(
      `round ${round + 1}/${rounds}  loss=${lastLoss.toFixed(4)}  samples=${samples.length}  (${elapsed}s)`,
    );
    if (round + 1 < rounds) {
      // Empty bars for the next round during its collection phase.
      renderBars(
        round + 2,
        rounds,
        { done: 0, total: gamesPerRound },
        { done: 0, total: 0 },
      );
    }
  }
  clearBar();
}

runMain(main);
