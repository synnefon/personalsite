/* eslint-disable */
// Worker entry point for parallel round-robin games. Each job runs one
// full game with all 7 archetypes randomly seated; main thread tracks
// wins by archetype.
require("ts-node/register/transpile-only");
const { parentPort, workerData } = require("worker_threads");
const { runOneGame } = require("./selfPlay.ts");
const {
  selectBestAttackForArchetype,
} = require("../model/policy.ts");
const { ARCHETYPE_IDS } = require("../model/personalities.ts");
const { NUM_PLAYERS } = require("../constants.ts");

const { weights } = workerData;

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildPolicies(assignment) {
  return assignment.map((archetype) => (ctx) =>
    selectBestAttackForArchetype(
      ctx.map,
      ctx.playerId,
      ctx.turnIndex,
      ctx.adjacency,
      weights,
      archetype,
      ctx.recentAttackers,
      undefined,
      ctx.legalMoves,
      ctx.cache,
    ),
  );
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
    const result = runOneGame(buildPolicies(assignment));
    parentPort.postMessage({
      type: "done",
      winnerArch: assignment[result.winner],
      rounds: result.rounds,
    });
  } else if (msg && msg.type === "shutdown") {
    process.exit(0);
  }
});

parentPort.postMessage({ type: "ready" });
