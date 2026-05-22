/* eslint-disable */
// Worker entry point for parallel self-play data collection. Hosted as plain
// JS so the Worker constructor accepts it directly; loads ts-node to handle
// the .ts modules below. Spawned by train.ts when WOTD_GAMES is large enough
// to amortize worker startup.
require("ts-node/register/transpile-only");
const { parentPort, workerData } = require("worker_threads");
const { samplingNeuralPolicy, runOneGameWithPolicy } = require("./selfPlay.ts");
const { NUM_PLAYERS } = require("../constants.ts");

const { weights, numGames, temp } = workerData;
const policies = Array.from({ length: NUM_PLAYERS }, () =>
  samplingNeuralPolicy(weights, temp),
);

const results = [];
for (let i = 0; i < numGames; i++) {
  results.push(runOneGameWithPolicy(policies));
}

parentPort.postMessage(results);
