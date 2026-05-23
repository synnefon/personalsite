import type { AIMove } from "../ai.ts";
import type { GameMap } from "../types.ts";
import { encodeAdjacency, type EncodedAdjacency } from "./encoding.ts";
import { sampleAttackByValue, selectBestAttackByValue } from "./policy.ts";
import { BAKED_WEIGHTS } from "./weights.ts";

// Cache the CSR adjacency per game so the policy doesn't pay for it on every
// move. Keyed on the underlying adjacency Map reference, which is stable
// across attack/reinforcement updates within a single game. NOT thread-safe;
// this module assumes single-threaded browser use.
let adjCache: {
  key: GameMap["adjacency"];
  encoded: EncodedAdjacency;
} | null = null;

/**
 * Drop-in replacement for the linear `selectBestAttack`, backed by the
 * baked value-network weights. The decision rule is 1-ply expectation:
 * for each candidate attack, evaluate V(s_success) and V(s_fail) and
 * pick the move maximizing P_attack·V(success) + (1−P_attack)·V(fail).
 * Pass is V(current state).
 *
 * `temp > 0` softmax-samples the Q values — used to express the "Chaos"
 * archetype's stochasticity without training a separate model.
 */
export function selectBestAttackBaked(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  temp: number,
): AIMove | null {
  if (!adjCache || adjCache.key !== map.adjacency) {
    adjCache = { key: map.adjacency, encoded: encodeAdjacency(map) };
  }
  if (temp > 0) {
    return sampleAttackByValue(
      map,
      playerId,
      turnIndex,
      adjCache.encoded,
      BAKED_WEIGHTS,
      temp,
    );
  }
  return selectBestAttackByValue(
    map,
    playerId,
    turnIndex,
    adjCache.encoded,
    BAKED_WEIGHTS,
  );
}
