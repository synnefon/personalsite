import type { GameMap } from "./types.ts";

/**
 * Size of the player's largest territory cluster (BFS over the territory
 * adjacency graph). This is the reinforcement currency in Dicewars — also
 * the central term the AI evaluator cares about.
 */
export function largestComponent(map: GameMap, playerId: number): number {
  const visited = new Set<number>();
  let best = 0;
  for (let i = 0; i < map.territories.length; i++) {
    if (visited.has(i)) continue;
    if (map.territories[i].ownerId !== playerId) continue;
    let size = 0;
    const stack: number[] = [i];
    visited.add(i);
    while (stack.length > 0) {
      const t = stack.pop();
      if (t === undefined) break;
      size++;
      const neighbors = map.adjacency.get(t);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (visited.has(n)) continue;
        if (map.territories[n].ownerId !== playerId) continue;
        visited.add(n);
        stack.push(n);
      }
    }
    if (size > best) best = size;
  }
  return best;
}

/** True iff the player owns no territories. */
export function playerIsEliminated(map: GameMap, playerId: number): boolean {
  for (const t of map.territories) {
    if (t.ownerId === playerId) return false;
  }
  return true;
}

/**
 * The ID of the only remaining player if exactly one player still owns
 * territory; null otherwise.
 */
export function soleSurvivor(map: GameMap): number | null {
  const owners = new Set<number>();
  for (const t of map.territories) owners.add(t.ownerId);
  if (owners.size !== 1) return null;
  const iter = owners.values().next();
  return iter.done ? null : iter.value;
}
