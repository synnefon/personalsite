import type { AIMove } from "../ai.ts";
import type { GameMap } from "../types.ts";
import { encodeAdjacency, type EncodedAdjacency } from "./encoding.ts";
import { selectBestAttackModel } from "./policy.ts";
import { BAKED_WEIGHTS } from "./weights.ts";

// Cache the CSR adjacency per game so the policy doesn't pay for it on every
// move. Keyed on the underlying adjacency Map reference, which is stable
// across attack/reinforcement updates within a single game.
let adjCache: {
  key: GameMap["adjacency"];
  encoded: EncodedAdjacency;
} | null = null;

/**
 * Drop-in replacement for the linear `selectBestAttack`, backed by the
 * baked NN weights and the hand-rolled forward pass. Caches the per-game
 * adjacency so each call is just one forward through the network.
 */
export function selectBestAttackBaked(
  map: GameMap,
  playerId: number,
  turnIndex: number,
): AIMove | null {
  if (!adjCache || adjCache.key !== map.adjacency) {
    adjCache = { key: map.adjacency, encoded: encodeAdjacency(map) };
  }
  return selectBestAttackModel(
    map,
    playerId,
    BAKED_WEIGHTS,
    turnIndex,
    adjCache.encoded,
  );
}
