/* eslint-disable */
// Worker entry point for parallel round-robin games. Each job runs one
// full game with all 7 archetypes randomly seated; main thread tracks
// wins by archetype.
require("ts-node/register/transpile-only");
const { parentPort, workerData } = require("worker_threads");
const { policyFromArchetype, runOneGame } = require("./selfPlay.ts");
const { ARCHETYPE_IDS } = require("../model/personalities.ts");
const { NUM_PLAYERS } = require("../constants.ts");

const { weights } = workerData;

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

parentPort.on("message", (msg) => {
  if (msg && msg.type === "job") {
    const assignment = ARCHETYPE_IDS.slice();
    shuffleInPlace(assignment);
    if (assignment.length !== NUM_PLAYERS) {
      parentPort.postMessage({
        type: "error",
        error: `expected NUM_PLAYERS=${NUM_PLAYERS} archetypes, got ${assignment.length}`,
      });
      return;
    }
    const policies = assignment.map((a) => policyFromArchetype(weights, a));
    const result = runOneGame(
      policies,
      undefined,
      undefined,
      undefined,
      /* recordSamples */ false,
    );
    // Opt-in major GC between jobs. Active only when the worker was
    // launched with `--expose-gc`; otherwise `global.gc` is undefined.
    if (typeof global.gc === "function") global.gc();
    parentPort.postMessage({
      type: "done",
      winnerArch: assignment[result.winner],
      rounds: result.rounds,
      cacheHits: result.cacheHits,
      cacheMisses: result.cacheMisses,
    });
  } else if (msg && msg.type === "shutdown") {
    process.exit(0);
  }
});

parentPort.postMessage({ type: "ready" });
