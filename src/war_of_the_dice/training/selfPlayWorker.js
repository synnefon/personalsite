/* eslint-disable */
// Worker entry point for parallel linear-AI data collection.
//
// Worker pool protocol: main thread sends one `{type:"job"}` per game,
// worker runs one game and posts `{type:"done", result}`, repeats until
// main sends `{type:"shutdown"}`. Per-game dispatch (instead of a fixed
// chunk per worker at startup) means completions trickle in
// continuously rather than bursting at synchronized intervals — bar
// stays smooth.
require("ts-node/register/transpile-only");
const { parentPort } = require("worker_threads");
const { linearPolicy, runOneGame } = require("./selfPlay.ts");
const { NUM_PLAYERS } = require("../constants.ts");

parentPort.on("message", (msg) => {
  if (msg && msg.type === "job") {
    const policies = Array.from({ length: NUM_PLAYERS }, () => linearPolicy());
    const result = runOneGame(policies);
    parentPort.postMessage({ type: "done", result });
  } else if (msg && msg.type === "shutdown") {
    process.exit(0);
  }
});

parentPort.postMessage({ type: "ready" });
