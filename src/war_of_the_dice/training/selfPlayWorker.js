/* eslint-disable */
// Worker entry point for parallel game data collection. Two modes:
//
//   linear   — all 7 seats use linearPolicy() (original training mode)
//   selfplay — all 7 seats use samplingValuePolicy(weights, temp) for
//              exploration; weights are passed via workerData
//
// Worker pool protocol: main thread sends one {type:"job"} per game,
// worker runs one game and posts {type:"done", result}, repeats until
// main sends {type:"shutdown"}.
require("ts-node/register/transpile-only");
const { parentPort, workerData } = require("worker_threads");
const {
  linearPolicy,
  runOneGame,
  samplingValuePolicy,
} = require("./selfPlay.ts");
const { NUM_PLAYERS } = require("../constants.ts");

const { mode, weights, temp, lookaheadDepth } = workerData;

function buildPolicies() {
  if (mode === "selfplay") {
    return Array.from({ length: NUM_PLAYERS }, () =>
      samplingValuePolicy(weights, temp, undefined, lookaheadDepth ?? 1),
    );
  }
  return Array.from({ length: NUM_PLAYERS }, () => linearPolicy());
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
