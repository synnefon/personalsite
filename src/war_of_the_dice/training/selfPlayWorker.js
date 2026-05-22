/* eslint-disable */
// Worker entry point for parallel self-play data collection. Hosted as plain
// JS so the Worker constructor accepts it directly; loads ts-node to handle
// the .ts modules below. Spawned by train.ts when WOTD_GAMES is large enough
// to amortize worker startup.
require("ts-node/register/transpile-only");
const { parentPort, workerData } = require("worker_threads");
const { samplingNeuralPolicy, runOneGameWithPolicy } = require("./selfPlay.ts");
const { randomPersonality } = require("../model/personalities.ts");
const { NUM_PLAYERS } = require("../constants.ts");

const { weights, numGames, temp } = workerData;

const results = [];
for (let i = 0; i < numGames; i++) {
  // Each game gets fresh per-seat personalities so the trained set is
  // sampled evenly across all of this worker's games.
  const personalities = Array.from({ length: NUM_PLAYERS }, () =>
    randomPersonality(),
  );
  const policies = personalities.map(() => samplingNeuralPolicy(weights, temp));
  results.push(runOneGameWithPolicy(policies, personalities));
}

parentPort.postMessage(results);
