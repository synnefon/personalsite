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

type CollectMode =
  | { kind: "linear" }
  | {
      kind: "selfplay";
      weights: ModelWeights;
      temp: number;
      lookaheadDepth: number;
    };

/** Single-threaded data collection in the configured mode. */
function collectGames(
  numGames: number,
  rng: () => number,
  mode: CollectMode,
  onGameDone: () => void,
): SampleWithAdj[] {
  const buildPolicies = (): Policy[] => {
    if (mode.kind === "selfplay") {
      return Array.from({ length: NUM_PLAYERS }, () =>
        samplingValuePolicy(mode.weights, mode.temp, rng, mode.lookaheadDepth),
      );
    }
    return Array.from({ length: NUM_PLAYERS }, () => linearPolicy());
  };
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

type WorkerMessage =
  | { type: "ready" }
  | { type: "done"; result: WorkerResult };

/**
 * Parallel data collection via worker pool. Workers send `ready` once
 * after boot, then alternate between accepting `job` messages and posting
 * `done` results. Each `done` arrival immediately triggers the next
 * dispatch (or shutdown if all games dispatched), so completions trickle
 * in at the natural per-game cadence — no synchronized bursts.
 *
 * `mode` controls policies: `linear` uses linearPolicy; `selfplay` uses
 * samplingValuePolicy with the supplied weights and temperature.
 */
function collectGamesParallel(
  numGames: number,
  numWorkers: number,
  mode: CollectMode,
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

    // Snapshot weights once per round here — sent to every worker via
    // structured clone. Self-play training keeps weights fixed for the
    // duration of one collection round (matching AlphaZero's "freeze the
    // policy, generate games, then train on them" loop).
    const workerData =
      mode.kind === "selfplay"
        ? {
            mode: "selfplay",
            weights: mode.weights,
            temp: mode.temp,
            lookaheadDepth: mode.lookaheadDepth,
          }
        : { mode: "linear" };

    for (let w = 0; w < effectiveWorkers; w++) {
      const worker = new Worker(workerPath, { workerData });
      workers.push(worker);
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
 * Top-level training. Two modes:
 *
 *   WOTD_SELF_PLAY=0 (default) — collects linear-AI games, trains V on
 *     win labels. From-scratch supervised training, produces the baseline.
 *
 *   WOTD_SELF_PLAY=1 — warm-starts from `value-latest.json`, then each
 *     round generates games with all 7 seats using samplingValuePolicy
 *     (current weights, temperature WOTD_SELFPLAY_TEMP, default 0.5).
 *     Trains V on those. AlphaZero-style: freeze policy, generate games,
 *     train on outcomes, repeat. Output goes to `value-selfplay-*.json`
 *     to keep the linear-trained baseline distinct.
 */
async function main(): Promise<void> {
  const rounds = envNumber("WOTD_ROUNDS", DEFAULT_ROUNDS);
  const gamesPerRound = envNumber("WOTD_GAMES", DEFAULT_GAMES_PER_ROUND);
  const epochsPerRound = envNumber("WOTD_EPOCHS", DEFAULT_EPOCHS_PER_ROUND);
  const lr = envNumber("WOTD_LR", DEFAULT_LR);
  const batchSize = envNumber("WOTD_BATCH", DEFAULT_BATCH_SIZE);
  const selfPlay = process.env.WOTD_SELF_PLAY === "1";
  const selfPlayTemp = envNumber("WOTD_SELFPLAY_TEMP", 0.5);
  const selfPlayLookahead = envNumber("WOTD_SELFPLAY_LOOKAHEAD", 3);
  const seed = process.env.WOTD_SEED;
  const rng = makeRng(seed);

  const useWorkers =
    gamesPerRound >= PARALLEL_THRESHOLD &&
    process.env.WOTD_NO_WORKERS !== "1";
  const numWorkers = useWorkers
    ? Math.min(os.cpus().length, gamesPerRound)
    : 1;

  // Self-play writes to a separate prefix so the linear-trained baseline
  // (value-latest.json) is preserved for A/B comparison.
  const ckptPrefix = selfPlay ? "value-selfplay" : "value";

  milestone(
    `${selfPlay ? "self-play" : "linear-AI"} training: rounds=${rounds} games/round=${gamesPerRound} epochs/round=${epochsPerRound} lr=${lr} batch=${batchSize}${selfPlay ? ` temp=${selfPlayTemp} lookahead=${selfPlayLookahead}` : ""}${seed ? ` seed=${seed}` : ""}`,
  );
  milestone(
    `data collection: ${useWorkers ? `${numWorkers} workers` : "single-threaded"}`,
  );

  const checkpointDir = path.resolve(__dirname, "checkpoints");
  ensureDir(checkpointDir);

  const model = buildTfModel();
  buildLayers(model);

  // Self-play requires a warm-start from the existing trained baseline.
  // Generating data via random-init weights would produce noise; the loop
  // only makes sense as a refinement step from an already-decent policy.
  if (selfPlay) {
    const baseline = path.join(checkpointDir, "value-latest.json");
    if (!fs.existsSync(baseline)) {
      throw new Error(
        `self-play requires ${baseline}; run linear training first`,
      );
    }
    const raw = JSON.parse(fs.readFileSync(baseline, "utf8"));
    applyWeights(model, deserializeWeights(raw));
    milestone(`warm-started from ${path.basename(baseline)}`);
  } else {
    milestone(`starting from random init`);
  }

  const optimizer = tf.train.adam(lr);

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

    // Snapshot weights once per round for self-play data generation. The
    // workers see this frozen policy for the entire round's games.
    const collectMode: CollectMode = selfPlay
      ? {
          kind: "selfplay",
          weights: await extractWeights(model),
          temp: selfPlayTemp,
          lookaheadDepth: selfPlayLookahead,
        }
      : { kind: "linear" };

    let gamesDone = 0;
    let batchesDone = 0;
    let batchesInRound = 0;
    const draw = (): void =>
      renderBars(
        round + 1,
        rounds,
        { done: gamesDone, total: gamesPerRound },
        { done: batchesDone, total: batchesInRound },
      );
    draw();

    const onGameDone = (): void => {
      gamesDone++;
      draw();
    };
    const samples = useWorkers
      ? await collectGamesParallel(
          gamesPerRound,
          numWorkers,
          collectMode,
          onGameDone,
        )
      : collectGames(gamesPerRound, rng, collectMode, onGameDone);

    const batchesPerEpoch = Math.ceil(samples.length / batchSize);
    batchesInRound = batchesPerEpoch * epochsPerRound;
    draw();

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
          draw();
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
      `${ckptPrefix}-${round.toString().padStart(3, "0")}.json`,
    );
    fs.writeFileSync(ckptPath, JSON.stringify(serializeWeights(finalWeights)));
    fs.writeFileSync(
      path.join(checkpointDir, `${ckptPrefix}-latest.json`),
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
