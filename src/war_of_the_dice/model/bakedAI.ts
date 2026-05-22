import type { AIMove } from "../ai.ts";
import type { GameMap } from "../types.ts";
import {
  encodeAdjacency,
  encodeBoard,
  type EncodedAdjacency,
} from "./encoding.ts";
import type { PersonalityId } from "./personalities.ts";
import { sampleAttackModel, selectBestAttackModel } from "./policy.ts";
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
 * baked NN weights and the hand-rolled forward pass. The caller passes the
 * per-color personality and inference temperature explicitly — those
 * decisions live in the UI (or in `defaultColorPersonality` /
 * `defaultColorInferenceTemp` from `personalities.ts` if no override),
 * not in this function.
 *
 * When `temp > 0` the move is sampled via softmax over the Q-values; that's
 * how the Chaos archetype is expressed without training a separate head.
 */
export function selectBestAttackBaked(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  personality: PersonalityId,
  temp: number,
): AIMove | null {
  if (!adjCache || adjCache.key !== map.adjacency) {
    adjCache = { key: map.adjacency, encoded: encodeAdjacency(map) };
  }
  const encodedBoard = encodeBoard(map, playerId, turnIndex, personality);
  if (temp > 0) {
    return sampleAttackModel(
      map,
      playerId,
      BAKED_WEIGHTS,
      encodedBoard,
      adjCache.encoded,
      temp,
    );
  }
  return selectBestAttackModel(
    map,
    playerId,
    BAKED_WEIGHTS,
    encodedBoard,
    adjCache.encoded,
  );
}
