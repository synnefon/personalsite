/* eslint-disable no-console */
/**
 * Archetype round-robin tournament. Each game has all 7 archetypes
 * randomly assigned to seats; we track wins per archetype across N
 * games to measure relative strength in a mixed-population matchup.
 *
 * Vengeful sees real attack history via DecisionContext.recentAttackers,
 * maintained inside runOneGame.
 */
import * as fs from "fs";
import * as path from "path";
import { NUM_PLAYERS } from "../constants.ts";
import type { ModelWeights } from "../model/forward.ts";
import { ARCHETYPE_IDS, type ArchetypeId } from "../model/personalities.ts";
import { selectBestAttackForArchetype } from "../model/policy.ts";
import { runOneGame, type Policy } from "./selfPlay.ts";
import { deserializeWeights } from "./tfModel.ts";
import {
  envNumber,
  makeRng,
  resolveCheckpoint,
  runMain,
  shuffleInPlace,
} from "./util.ts";

const DEFAULT_NUM_GAMES = 100;

/** Wilson 95% binomial CI. */
function wilson95(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/** Build a Policy that decides via the value network + given archetype. */
function archetypePolicy(
  weights: ModelWeights,
  archetype: ArchetypeId,
): Policy {
  return (ctx) =>
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
    );
}

async function main(): Promise<void> {
  const numGames = envNumber("WOTD_GAMES", DEFAULT_NUM_GAMES);
  const rng = makeRng(process.env.WOTD_SEED);

  if (NUM_PLAYERS !== ARCHETYPE_IDS.length) {
    throw new Error(
      `round-robin assumes NUM_PLAYERS (${NUM_PLAYERS}) === archetypes (${ARCHETYPE_IDS.length})`,
    );
  }

  const ckptPath = resolveCheckpoint({
    override: process.env.WOTD_CKPT,
    ckptDir: path.resolve(__dirname, "checkpoints"),
    candidates: ["value-latest.json"],
  });
  console.log(`loading weights from ${ckptPath}`);
  const raw = JSON.parse(fs.readFileSync(ckptPath, "utf8"));
  const weights: ModelWeights = deserializeWeights(raw);

  console.log(
    `round-robin: ${numGames} games, each game = all 7 archetypes randomly seated`,
  );

  const wins = new Map<ArchetypeId, number>();
  for (const a of ARCHETYPE_IDS) wins.set(a, 0);
  let totalRounds = 0;

  const t0 = Date.now();
  for (let g = 0; g < numGames; g++) {
    // Random seat assignment of the 7 archetypes.
    const assignment = ARCHETYPE_IDS.slice();
    shuffleInPlace(assignment as ArchetypeId[], rng);
    const policies: Policy[] = assignment.map((a) =>
      archetypePolicy(weights, a),
    );
    const result = runOneGame(policies, undefined, undefined, rng);
    const winnerArch = assignment[result.winner];
    wins.set(winnerArch, (wins.get(winnerArch) ?? 0) + 1);
    totalRounds += result.rounds;

    if ((g + 1) % 10 === 0) {
      console.log(`  ${g + 1}/${numGames} games`);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // Sort archetypes by win count descending.
  const ranked = [...ARCHETYPE_IDS].sort(
    (a, b) => (wins.get(b) ?? 0) - (wins.get(a) ?? 0),
  );
  const baselineRate = 1 / NUM_PLAYERS;

  console.log(
    `\nresults (${elapsed}s, ${(totalRounds / numGames).toFixed(1)} rounds/game avg):`,
  );
  for (const arch of ranked) {
    const w = wins.get(arch) ?? 0;
    const rate = w / numGames;
    const [lo, hi] = wilson95(w, numGames);
    const baselineDelta = (rate - baselineRate) * 100;
    const sign = baselineDelta >= 0 ? "+" : "";
    console.log(
      `  ${(arch as string).padEnd(12)} ${w.toString().padStart(4)}/${numGames}  ${(rate * 100).toFixed(1)}%  CI [${(lo * 100).toFixed(1)}%, ${(hi * 100).toFixed(1)}%]  (${sign}${baselineDelta.toFixed(1)}pp vs baseline)`,
    );
  }
  console.log(
    `  baseline 1/${NUM_PLAYERS}:    ${(baselineRate * 100).toFixed(1)}%`,
  );
}

runMain(main);
