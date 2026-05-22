/* eslint-disable no-console */
import * as tf from "@tensorflow/tfjs-node";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Worker } from "worker_threads";
import { NUM_PLAYERS } from "../constants.ts";
import { generateMap } from "../mapGenerator.ts";
import {
  encodeAdjacency,
  encodeBoard,
} from "../model/encoding.ts";
import type { ModelWeights } from "../model/forward.ts";
import {
  PERSONALITY_IDS,
  randomPersonality,
  type PersonalityId,
} from "../model/personalities.ts";
import { milestone, progress } from "./progress.ts";
import {
  runOneGameWithPolicy,
  samplingNeuralPolicy,
  type DecisionRecord,
  type GameResultWithLog,
  type Policy,
} from "./selfPlay.ts";
import {
  adjacencyToMeanMatrix,
  applyWeights,
  buildTfModel,
  deserializeWeights,
  extractWeights,
  forwardEmbeddings,
  forwardScoreMove,
  forwardScorePass,
  outcomeLoss,
  serializeWeights,
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
const DEFAULT_TEMP = 0.5;
const DEFAULT_BATCH_SIZE = 16;
const PARALLEL_THRESHOLD = 16;

type SampleWithAdj = {
  sample: DecisionRecord;
  adjMatrix: tf.Tensor;
};

/**
 * Force every layer to build (and register trainable variables) before any
 * weight-loading. Uses a quick generated map for a real-shape dummy forward
 * pass; the conditioning personality picked doesn't matter, just that the
 * input shape matches what training will produce.
 */
function buildLayers(model: TfModel): void {
  const dummyMap = generateMap();
  const adjacency = encodeAdjacency(dummyMap);
  const board = encodeBoard(dummyMap, 0, 0, PERSONALITY_IDS[0]);
  const adjMatrix = adjacencyToMeanMatrix(adjacency);
  tf.tidy(() => {
    const emb = forwardEmbeddings(model, board, adjMatrix);
    forwardScorePass(model, emb);
    forwardScoreMove(model, emb, 0, 1, 0.5);
  });
  adjMatrix.dispose();
}

/**
 * Run one round of self-play with the current weights snapshot, collecting
 * every per-decision sample for training. Each seat is assigned a fresh
 * random personality per game from PERSONALITY_IDS, so the network sees
 * every trained archetype evenly across training. Caller owns the returned
 * tensors and must dispose them (one adjMatrix per game).
 */
function collectSelfPlay(
  weightsSnapshot: ModelWeights,
  numGames: number,
  temp: number,
  rng: () => number,
): SampleWithAdj[] {
  const out: SampleWithAdj[] = [];
  for (let g = 0; g < numGames; g++) {
    const personalities: PersonalityId[] = Array.from(
      { length: NUM_PLAYERS },
      () => randomPersonality(rng),
    );
    const policies: Policy[] = personalities.map(() =>
      samplingNeuralPolicy(weightsSnapshot, temp, rng),
    );
    const result = runOneGameWithPolicy(
      policies,
      personalities,
      undefined,
      undefined,
      rng,
    );
    const adjMatrix = adjacencyToMeanMatrix(result.adjacency);
    for (const d of result.decisions) {
      out.push({ sample: d, adjMatrix });
    }
    progress(`  collected ${g + 1}/${numGames} games`);
  }
  return out;
}

/**
 * Spawn `numWorkers` worker_threads, each running a chunk of self-play games
 * with the supplied weights snapshot. Workers return raw GameResultWithLog
 * objects; the main thread materializes the per-game adjacency-mean tensor
 * (tf.Tensor can't cross thread boundaries).
 */
function collectSelfPlayParallel(
  weights: ModelWeights,
  numGames: number,
  temp: number,
  numWorkers: number,
): Promise<SampleWithAdj[]> {
  const workerPath = path.resolve(__dirname, "selfPlayWorker.js");
  const gamesPerWorker = Math.ceil(numGames / numWorkers);

  const workerPromises: Promise<GameResultWithLog[]>[] = [];
  for (let w = 0; w < numWorkers; w++) {
    const offset = w * gamesPerWorker;
    const n = Math.min(gamesPerWorker, numGames - offset);
    if (n <= 0) break;
    workerPromises.push(
      new Promise<GameResultWithLog[]>((resolve, reject) => {
        const worker = new Worker(workerPath, {
          workerData: { weights, numGames: n, temp },
        });
        worker.on("message", (msg: GameResultWithLog[]) => resolve(msg));
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0) reject(new Error(`worker exited with code ${code}`));
        });
      }),
    );
  }

  let completedWorkers = 0;
  for (const p of workerPromises) {
    void p.then(() => {
      completedWorkers++;
      progress(
        `  data collection: ${completedWorkers}/${workerPromises.length} workers done`,
      );
    });
  }

  return Promise.all(workerPromises).then((perWorker) => {
    const samples: SampleWithAdj[] = [];
    for (const results of perWorker) {
      for (const result of results) {
        const adjMatrix = adjacencyToMeanMatrix(result.adjacency);
        for (const d of result.decisions) {
          samples.push({ sample: d, adjMatrix });
        }
      }
    }
    return samples;
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
 * One pass over `samples` with BCE-against-outcome. Variable batch size = 1
 * inside the optimizer step because each sample's candidate count differs
 * (vectorized batching would need padding/bucketing).
 */
async function trainOneEpoch(
  model: TfModel,
  optimizer: tf.Optimizer,
  samples: SampleWithAdj[],
  batchSize: number,
  label: string,
  rng: () => number,
): Promise<number> {
  shuffleInPlace(samples, rng);
  let totalLoss = 0;
  let totalSamples = 0;
  const totalBatches = Math.ceil(samples.length / batchSize);
  let batchIdx = 0;
  for (let start = 0; start < samples.length; start += batchSize) {
    const batch = samples.slice(start, start + batchSize);
    const lossTensor = optimizer.minimize(() => {
      let sumLoss: tf.Tensor | null = null;
      for (const { sample, adjMatrix } of batch) {
        const sampleLoss = outcomeLoss(
          model,
          sample.board,
          adjMatrix,
          sample.candidates,
          sample.chosenIdx,
          sample.target,
        );
        sumLoss = sumLoss === null ? sampleLoss : sumLoss.add(sampleLoss);
      }
      return sumLoss!.div(batch.length) as tf.Scalar;
    }, true) as tf.Scalar;
    totalLoss += (await lossTensor.data())[0] * batch.length;
    totalSamples += batch.length;
    lossTensor.dispose();
    batchIdx++;
    progress(
      `  ${label} batch ${batchIdx}/${totalBatches}  running_loss=${(totalLoss / totalSamples).toFixed(4)}`,
    );
  }
  return totalLoss / totalSamples;
}

/**
 * Top-level self-play training: alternate between collecting fresh games
 * (using current weights + softmax exploration) and training on the
 * collected decisions with BCE against the per-actor win label.
 * Checkpoints every round.
 */
async function main(): Promise<void> {
  const rounds = envNumber("WOTD_ROUNDS", DEFAULT_ROUNDS);
  const gamesPerRound = envNumber("WOTD_GAMES", DEFAULT_GAMES_PER_ROUND);
  const epochsPerRound = envNumber("WOTD_EPOCHS", DEFAULT_EPOCHS_PER_ROUND);
  const lr = envNumber("WOTD_LR", DEFAULT_LR);
  const temp = envNumber("WOTD_TEMP", DEFAULT_TEMP);
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
    `self-play training: rounds=${rounds} games/round=${gamesPerRound} epochs/round=${epochsPerRound} lr=${lr} temp=${temp} batch=${batchSize}${seed ? ` seed=${seed}` : ""}`,
  );
  milestone(
    `data collection: ${useWorkers ? `${numWorkers} workers` : "single-threaded"}`,
  );

  const checkpointDir = path.resolve(__dirname, "checkpoints");
  ensureDir(checkpointDir);

  const model = buildTfModel();
  buildLayers(model);

  const warmStartPath = path.join(checkpointDir, "warmStart.json");
  if (fs.existsSync(warmStartPath) && process.env.WOTD_SKIP_WS !== "1") {
    const raw = JSON.parse(fs.readFileSync(warmStartPath, "utf8"));
    applyWeights(model, deserializeWeights(raw));
    milestone(`loaded warm-start weights from ${warmStartPath}`);
  } else {
    milestone(
      `starting from random init (warmStart not found or WOTD_SKIP_WS=1)`,
    );
  }

  const optimizer = tf.train.adam(lr);

  for (let round = 0; round < rounds; round++) {
    const t0 = Date.now();

    const snapshot = await extractWeights(model);
    const samples = useWorkers
      ? await collectSelfPlayParallel(snapshot, gamesPerRound, temp, numWorkers)
      : collectSelfPlay(snapshot, gamesPerRound, temp, rng);

    let lastLoss = 0;
    for (let ep = 0; ep < epochsPerRound; ep++) {
      lastLoss = await trainOneEpoch(
        model,
        optimizer,
        samples,
        batchSize,
        `round ${round + 1}/${rounds} ep ${ep + 1}/${epochsPerRound}`,
        rng,
      );
    }

    disposeAdjacencies(samples);

    const finalWeights = await extractWeights(model);
    const ckptPath = path.join(
      checkpointDir,
      `selfPlay-${round.toString().padStart(3, "0")}.json`,
    );
    fs.writeFileSync(ckptPath, JSON.stringify(serializeWeights(finalWeights)));
    fs.writeFileSync(
      path.join(checkpointDir, "selfPlay-latest.json"),
      JSON.stringify(serializeWeights(finalWeights)),
    );

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `round ${round + 1}/${rounds}  loss=${lastLoss.toFixed(4)}  decisions=${samples.length}  (${elapsed}s)`,
    );
  }
}

runMain(main);
