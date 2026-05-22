/* eslint-disable no-console */
import * as tf from "@tensorflow/tfjs";
import * as fs from "fs";
import * as path from "path";
import { NUM_PLAYERS } from "../constants.ts";
import {
  linearPolicy,
  runOneGameWithPolicy,
  type DecisionRecord,
} from "./selfPlay.ts";
import {
  adjacencyToMeanMatrix,
  buildTfModel,
  extractWeights,
  forwardEmbeddings,
  forwardScoreMove,
  forwardScorePass,
  imitationLoss,
  serializeWeights,
  type TfModel,
} from "./tfModel.ts";

const DEFAULT_GAMES = 100;
const DEFAULT_EPOCHS = 10;
const DEFAULT_LR = 1e-3;
const DEFAULT_VAL_FRACTION = 0.1;
const DEFAULT_BATCH_SIZE = 16;

type SampleWithAdj = {
  sample: DecisionRecord;
  adjMatrix: tf.Tensor;
};

/**
 * Generate training data by running self-play between linear-AI seats.
 * Each in-game decision becomes one (state, chosen action) sample. The
 * adjacency-mean matrix is materialized once per game and shared across
 * all of that game's samples (~30 decisions per game on average).
 */
function collectLinearSamples(numGames: number): SampleWithAdj[] {
  const out: SampleWithAdj[] = [];
  for (let g = 0; g < numGames; g++) {
    const policies = Array.from(
      { length: NUM_PLAYERS },
      () => linearPolicy(),
    );
    const result = runOneGameWithPolicy(policies);
    const adjMatrix = adjacencyToMeanMatrix(result.adjacency);
    for (const d of result.decisions) {
      out.push({ sample: d, adjMatrix });
    }
    if ((g + 1) % 10 === 0) {
      console.log(`  collected ${g + 1}/${numGames} games`);
    }
  }
  return out;
}

/** Fisher–Yates shuffle in place. */
function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/**
 * Fraction of samples where the network's argmax matches the linear AI's
 * chosen action. The held-out version of this is the stopping signal —
 * when it plateaus, more training won't help imitation accuracy.
 */
async function evalAccuracy(
  model: TfModel,
  samples: ReadonlyArray<SampleWithAdj>,
): Promise<number> {
  let correct = 0;
  for (const { sample, adjMatrix } of samples) {
    const argmax = tf.tidy(() => {
      const embeddings = forwardEmbeddings(model, sample.board, adjMatrix);
      const logits: tf.Tensor[] = [forwardScorePass(model, embeddings)];
      for (const c of sample.candidates) {
        logits.push(
          forwardScoreMove(
            model,
            embeddings,
            c.sourceId,
            c.targetId,
            c.winProb,
          ),
        );
      }
      const stacked = tf.stack(logits);
      return stacked.argMax();
    });
    const idx = (await argmax.data())[0] as number;
    argmax.dispose();
    const targetIdx = sample.chosenIdx === -1 ? 0 : sample.chosenIdx + 1;
    if (idx === targetIdx) correct++;
  }
  return correct / samples.length;
}

/**
 * One epoch of cross-entropy imitation training (effective batch size = 1
 * per step; per-sample candidate counts vary so batching needs padding,
 * deferred to the perf-tuning pass). Returns mean loss across the epoch.
 */
async function trainOneEpoch(
  model: TfModel,
  optimizer: tf.Optimizer,
  samples: SampleWithAdj[],
  batchSize: number,
): Promise<number> {
  shuffleInPlace(samples);
  let totalLoss = 0;
  let totalSamples = 0;
  for (let start = 0; start < samples.length; start += batchSize) {
    const batch = samples.slice(start, start + batchSize);
    const lossTensor = optimizer.minimize(() => {
      let sumLoss: tf.Tensor | null = null;
      for (const { sample, adjMatrix } of batch) {
        const sampleLoss = imitationLoss(
          model,
          sample.board,
          adjMatrix,
          sample.candidates,
          sample.chosenIdx,
        );
        sumLoss = sumLoss === null ? sampleLoss : sumLoss.add(sampleLoss);
      }
      return sumLoss!.div(batch.length) as tf.Scalar;
    }, true) as tf.Scalar;
    totalLoss += (await lossTensor.data())[0] * batch.length;
    totalSamples += batch.length;
    lossTensor.dispose();
  }
  return totalLoss / totalSamples;
}

/** Top-level warm-start script: collect → split → train → checkpoint. */
async function main(): Promise<void> {
  const numGames = Number(process.env.WOTD_GAMES ?? DEFAULT_GAMES);
  const epochs = Number(process.env.WOTD_EPOCHS ?? DEFAULT_EPOCHS);
  const lr = Number(process.env.WOTD_LR ?? DEFAULT_LR);
  const valFraction = Number(process.env.WOTD_VAL ?? DEFAULT_VAL_FRACTION);
  const batchSize = Number(process.env.WOTD_BATCH ?? DEFAULT_BATCH_SIZE);

  console.log(
    `warm-start config: games=${numGames} epochs=${epochs} lr=${lr} val=${valFraction} batch=${batchSize}`,
  );

  console.log(`collecting linear-AI samples...`);
  const all = collectLinearSamples(numGames);
  console.log(`  ${all.length} decisions collected`);

  shuffleInPlace(all);
  const valSize = Math.floor(all.length * valFraction);
  const valSamples = all.slice(0, valSize);
  const trainSamples = all.slice(valSize);
  console.log(`  train: ${trainSamples.length}, val: ${valSamples.length}`);

  const model = buildTfModel();
  // Force every layer to build (and register its trainable variables) before
  // the first optimizer.minimize call — otherwise variableGrads can't trace
  // gradients to weights that don't exist yet.
  tf.tidy(() => {
    const warm = trainSamples[0];
    const emb = forwardEmbeddings(model, warm.sample.board, warm.adjMatrix);
    forwardScorePass(model, emb);
    if (warm.sample.candidates.length > 0) {
      const c = warm.sample.candidates[0];
      forwardScoreMove(model, emb, c.sourceId, c.targetId, c.winProb);
    }
  });

  const optimizer = tf.train.adam(lr);

  for (let ep = 0; ep < epochs; ep++) {
    const t0 = Date.now();
    const loss = await trainOneEpoch(model, optimizer, trainSamples, batchSize);
    const acc = await evalAccuracy(model, valSamples);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `epoch ${ep + 1}/${epochs}  loss=${loss.toFixed(4)}  val_acc=${(acc * 100).toFixed(1)}%  (${elapsed}s)`,
    );
  }

  const checkpointDir = path.resolve(__dirname, "checkpoints");
  if (!fs.existsSync(checkpointDir)) {
    fs.mkdirSync(checkpointDir, { recursive: true });
  }
  const outPath = path.join(checkpointDir, "warmStart.json");
  const weights = await extractWeights(model);
  fs.writeFileSync(outPath, JSON.stringify(serializeWeights(weights)));
  console.log(`saved weights to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
