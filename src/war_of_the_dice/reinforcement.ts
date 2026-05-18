import { MAX_DICE_PER_TERRITORY } from "./constants.ts";
import { largestComponent } from "./gameLogic.ts";
import type { GameMap } from "./types.ts";

export type ReinforcementResult = {
  map: GameMap;
  bank: number;
};

// Per-turn reinforcement: the player who just finished their turn gets one
// die for each territory in their largest connected cluster, scattered
// randomly across ALL their territories (capped at MAX_DICE_PER_TERRITORY).
// Any dice that don't fit because every territory is already at the cap are
// rolled forward into the bank and added to next turn's reinforcement.
export function reinforcePlayer(
  map: GameMap,
  playerId: number,
  startingBank: number,
  rng: () => number = Math.random
): ReinforcementResult {
  const owned: number[] = [];
  for (let i = 0; i < map.territories.length; i++) {
    if (map.territories[i].ownerId === playerId) owned.push(i);
  }
  if (owned.length === 0) return { map, bank: startingBank };

  const newTerritories = map.territories.map((t) => ({ ...t }));
  let toAdd = largestComponent(map, playerId) + startingBank;

  while (toAdd > 0) {
    const available: number[] = [];
    for (const idx of owned) {
      if (newTerritories[idx].dice < MAX_DICE_PER_TERRITORY) {
        available.push(idx);
      }
    }
    if (available.length === 0) break;
    const idx = available[Math.floor(rng() * available.length)];
    newTerritories[idx].dice++;
    toAdd--;
  }

  return {
    map: { ...map, territories: newTerritories },
    bank: toAdd,
  };
}
