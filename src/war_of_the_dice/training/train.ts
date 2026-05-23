/* eslint-disable no-console */
import * as tf from "@tensorflow/tfjs-node";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Worker } from "worker_threads";
import { NUM_PLAYERS } from "../constants.ts";
import {
  encodeAdjacency,
  encodeBoard,
} from "../model/encoding.ts";
import type { ModelWeights } from "../model/forward.ts";
import { generateMap } from "../mapGenerator.ts";
import { milestone } from "./progress.ts";
import {
  greedyValuePolicy,
  linearPolicy,
  runOneGame,
  type Policy,
  type ValueSample,
} from "./selfPlay.ts";
import {
  adjacencyToMeanMatrix,
  buildTfModel,
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
  pickRandomSeats,
  runMain,
  shuffleInPlace,
} from "./util.ts";

const DEFAULT_ROUNDS = 10;
const DEFAULT_GAMES_PER_ROUND = 30;
const DEFAULT_EPOCHS_PER_ROUND = 3;
const DEFAULT_LR = 5e-4;
const DEFAULT_BATCH_SIZE = 16;
const PARALLEL_THRESHOLD = 16;

const QUICK_EVAL_GAMES = 20;
const QUICK_EVAL_NN_SEATS = 3;

// ---- per-round batch progress bar ----------------------------------------
// Bar resets to 0% at the start of every round and fills to 100% as that
// round's training batches complete. Denominator (batches in this round)
// is known exactly after collection: ceil(samples / batchSize) * epochs.

const BAR_WIDTH = 24;

function renderBar(
  round: number,
  totalRounds: number,
  done: number,
  total: number,
): void {
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  const filled = Math.floor(pct * BAR_WIDTH);
  const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
  process.stdout.write(
    `\r\x1b[Kround ${round}/${totalRounds} [${bar}] ${(pct * 100).toFixed(1)}%`,
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

/** Single-threaded all-linear-AI data collection. */
function collectLinearGames(
  numGames: number,
  rng: () => number,
): SampleWithAdj[] {
  const out: SampleWithAdj[] = [];
  for (let g = 0; g < numGames; g++) {
    const policies: Policy[] = Array.from(
      { length: NUM_PLAYERS },
      () => linearPolicy(),
    );
    const result = runOneGame(policies, undefined, undefined, rng);
    const adjMatrix = adjacencyToMeanMatrix(result.adjacency);
    for (const s of result.samples) {
      out.push({ sample: s, adjMatrix });
    }
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

type WorkerMessage =
  | { type: "ready" }
  | { type: "done"; result: WorkerResult };

/**
 * Parallel all-linear-AI data collection via worker pool. Workers send
 * `ready` once after boot, then alternate between accepting `job`
 * messages and posting `done` results. Each `done` arrival immediately
 * triggers the next dispatch (or shutdown if all games dispatched), so
 * completions trickle in at the natural per-game cadence — no
 * synchronized bursts.
 */
function collectLinearGamesParallel(
  numGames: number,
  numWorkers: number,
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

    for (let w = 0; w < effectiveWorkers; w++) {
      const worker = new Worker(workerPath, { workerData: {} });
      workers.push(worker);
      worker.on("message", (msg: WorkerMessage) => {
        if (msg.type === "ready") {
          dispatchNext(worker);
          return;
        }
        if (msg.type === "done") {
          collected.push(msg.result);
          completed++;
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
 * accumulated into a single optimizer.minimize call.
 */
async function trainOneEpoch(
  model: TfModel,
  optimizer: tf.Optimizer,
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
    const lossTensor = optimizer.minimize(() => {
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
function quickEval(
  weights: ModelWeights,
  numGames: number,
  numNNSeats: number,
  rng: () => number,
): { nnWins: number; nnPlays: number; rate: number } {
  const nnPolicy = greedyValuePolicy(weights);
  let nnWins = 0;
  let nnPlays = 0;
  for (let g = 0; g < numGames; g++) {
    const nnSeats = pickRandomSeats(numNNSeats, rng);
    const policies: Policy[] = [];
    for (let i = 0; i < NUM_PLAYERS; i++) {
      policies.push(nnSeats.has(i) ? nnPolicy : linearPolicy());
    }
    const result = runOneGame(policies, undefined, undefined, rng);
    nnPlays += numNNSeats;
    if (nnSeats.has(result.winner)) nnWins++;
  }
  return { nnWins, nnPlays, rate: nnPlays > 0 ? nnWins / nnPlays : 0 };
}

/**
 * Top-level training: collect linear-AI games each round, train the value
 * network on per-state win labels, snapshot weights, eval against linear.
 */
async function main(): Promise<void> {
  const rounds = envNumber("WOTD_ROUNDS", DEFAULT_ROUNDS);
  const gamesPerRound = envNumber("WOTD_GAMES", DEFAULT_GAMES_PER_ROUND);
  const epochsPerRound = envNumber("WOTD_EPOCHS", DEFAULT_EPOCHS_PER_ROUND);
  const lr = envNumber("WOTD_LR", DEFAULT_LR);
  const batchSize = envNumber("WOTD_BATCH", DEFAULT_BATCH_SIZE);
  const seed = process.env.WOTD_SEED;
  const rng = makeRng(seed);

  const useWorkers =
    gamesPerRound >= PARALLEL_THRESHOLD &&
    process.env.WOTD_NO_WORKERS !== "1";
  const numWorkers = useWorkers
    ? Math.min(os.cpus().length, gamesPerRound)
    : 1;

  milestone(
    `value training: rounds=${rounds} games/round=${gamesPerRound} epochs/round=${epochsPerRound} lr=${lr} batch=${batchSize}${seed ? ` seed=${seed}` : ""}`,
  );
  milestone(
    `data collection: ${useWorkers ? `${numWorkers} workers` : "single-threaded"}`,
  );

  const checkpointDir = path.resolve(__dirname, "checkpoints");
  ensureDir(checkpointDir);

  const model = buildTfModel();
  buildLayers(model);
  milestone(`starting from random init`);

  const optimizer = tf.train.adam(lr);

  // Initial bar at 0% for round 1 — denominator unknown until first
  // collection finishes, so pass 1 so it renders as an empty bar.
  renderBar(1, rounds, 0, 1);

  for (let round = 0; round < rounds; round++) {
    const t0 = Date.now();

    const samples = useWorkers
      ? await collectLinearGamesParallel(gamesPerRound, numWorkers)
      : collectLinearGames(gamesPerRound, rng);

    const batchesPerEpoch = Math.ceil(samples.length / batchSize);
    const batchesInRound = batchesPerEpoch * epochsPerRound;
    let batchesDone = 0;
    renderBar(round + 1, rounds, batchesDone, batchesInRound);

    let lastLoss = 0;
    for (let ep = 0; ep < epochsPerRound; ep++) {
      lastLoss = await trainOneEpoch(
        model,
        optimizer,
        samples,
        batchSize,
        rng,
        () => {
          batchesDone++;
          renderBar(round + 1, rounds, batchesDone, batchesInRound);
        },
      );
    }

    disposeAdjacencies(samples);

    // Bar's done. Spinner-style ellipsis while we extract weights, save the
    // checkpoint, and run quickEval — these can take 5–10s combined, so
    // an explicit "still working" indicator beats a frozen 100%-full bar.
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

    const evalResult = quickEval(
      finalWeights,
      QUICK_EVAL_GAMES,
      QUICK_EVAL_NN_SEATS,
      rng,
    );
    clearInterval(spinner);
    const baseline = 1 / NUM_PLAYERS;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    clearBar();
    console.log(
      `round ${round + 1}/${rounds}  loss=${lastLoss.toFixed(4)}  samples=${samples.length}  nn_win=${(evalResult.rate * 100).toFixed(1)}% (${evalResult.nnWins}/${evalResult.nnPlays}, baseline ${(baseline * 100).toFixed(1)}%)  (${elapsed}s)`,
    );
    if (round + 1 < rounds) {
      // Empty bar for the next round during its collection phase.
      renderBar(round + 2, rounds, 0, 1);
    }
  }
  clearBar();
}

runMain(main);
