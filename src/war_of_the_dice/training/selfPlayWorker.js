/* eslint-disable */
// Worker entry point for parallel self-play data collection. Each job runs
// one game with all 7 seats using samplingValuePolicy at the workerData-
// supplied weights + temperature + lookahead depth.
//
// Worker pool protocol: main thread sends one {type:"job"} per game, worker
// runs one game and posts {type:"done", result}, repeats until main sends
// {type:"shutdown"}.
require("ts-node/register/transpile-only");
const { parentPort, workerData } = require("worker_threads");
const { runOneGame, samplingValuePolicy } = require("./selfPlay.ts");
const { NUM_PLAYERS } = require("../constants.ts");

const { weights, temp, lookaheadDepth } = workerData;

function buildPolicies() {
  return Array.from({ length: NUM_PLAYERS }, () =>
    samplingValuePolicy(weights, temp, undefined, lookaheadDepth ?? 1),
  );
}

parentPort.on("message", (msg) => {
  if (msg && msg.type === "job") {
    const result = runOneGame(buildPolicies());
    parentPort.postMessage({ type: "done", result });
  } else if (msg && msg.type === "shutdown") {
    process.exit(0);
  }
});

parentPort.postMessage({ type: "ready" });
