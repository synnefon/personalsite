import type { AttackMove, GameMap } from "../types.ts";
import { encodeAdjacency, type EncodedAdjacency } from "./encoding.ts";
import type { ArchetypeId } from "./personalities.ts";
import {
  makeValueCache,
  selectBestAttackForArchetype,
  type ValueCache,
} from "./policy.ts";
import { BAKED_WEIGHTS } from "./weights.ts";

// Cache the CSR adjacency per game so the policy doesn't pay for it on every
// move. Keyed on the underlying adjacency Map reference, which is stable
// across attack/reinforcement updates within a single game. NOT thread-safe;
// this module assumes single-threaded browser use.
let adjCache: {
  key: GameMap["adjacency"];
  encoded: EncodedAdjacency;
} | null = null;

// Per-turn value-network cache. Same actor's multiple decisions within a
// turn share board states; this memo skips redundant forward passes.
// Cleared via `resetBakedTurnCache()` when the actor changes — staleness
// would be silent and wrong (turnIndex/actor change invalidates entries).
let turnCache: ValueCache = makeValueCache();

/** Drop the per-turn V cache. Call at every turn boundary. */
export function resetBakedTurnCache(): void {
  turnCache = makeValueCache();
}

/**
 * Browser-side AI decision: trained value-network weights + per-archetype
 * decision modifiers, with a per-turn V(board) cache.
 *
 * Decision rule (see `policy.ts:selectBestAttackForArchetype`):
 *   1. Compute V-network Q for each candidate (1-ply expected value
 *      through end-of-turn reinforcement).
 *   2. Add the archetype's per-candidate Q bias (e.g., builder rewards
 *      attacks growing largest component; vengeful rewards retaliation).
 *   3. Apply the archetype's threshold multiplier to the players-remaining
 *      base threshold, then take the best attack if it clears, else pass.
 *      Chaos archetype softmax-samples instead.
 *
 * `recentAttackers` is the set of opponent player IDs who have captured
 * one of `playerId`'s territories recently; only the Vengeful archetype
 * reads it, but the signature stays uniform across archetypes.
 */
export function selectBestAttackBaked(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  archetype: ArchetypeId,
  recentAttackers: ReadonlySet<number>,
): AttackMove | null {
  if (!adjCache || adjCache.key !== map.adjacency) {
    adjCache = { key: map.adjacency, encoded: encodeAdjacency(map) };
  }
  return selectBestAttackForArchetype(
    map,
    playerId,
    turnIndex,
    adjCache.encoded,
    BAKED_WEIGHTS,
    archetype,
    recentAttackers,
    undefined,
    undefined,
    turnCache,
  );
}
