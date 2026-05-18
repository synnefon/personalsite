import type { GameMap } from "./types.ts";

export function canAttack(
  map: GameMap,
  sourceId: number,
  targetId: number
): boolean {
  if (sourceId === targetId) return false;
  const source = map.territories[sourceId];
  const target = map.territories[targetId];
  if (!source || !target) return false;
  if (source.ownerId === target.ownerId) return false;
  if (source.dice < 2) return false;
  const neighbors = map.adjacency.get(sourceId);
  return !!neighbors && neighbors.has(targetId);
}

export type AttackOutcome = {
  attackerRolls: number[];
  defenderRolls: number[];
  attackerSum: number;
  defenderSum: number;
  attackerWon: boolean;
};

export type AttackResult = {
  map: GameMap;
  outcome: AttackOutcome;
};

function rollDice(count: number, rng: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(1 + Math.floor(rng() * 6));
  return out;
}

function sum(arr: ReadonlyArray<number>): number {
  let s = 0;
  for (const n of arr) s += n;
  return s;
}

// Attacker wins on ties. On success, attacker's surviving dice move to the
// captured territory and the source drops to 1. On failure, source drops to
// 1, defender unchanged.
export function resolveAttack(
  map: GameMap,
  sourceId: number,
  targetId: number,
  rng: () => number = Math.random
): AttackResult {
  const source = map.territories[sourceId];
  const target = map.territories[targetId];

  const attackerRolls = rollDice(source.dice, rng);
  const defenderRolls = rollDice(target.dice, rng);
  const attackerSum = sum(attackerRolls);
  const defenderSum = sum(defenderRolls);
  const attackerWon = attackerSum >= defenderSum;

  const newTerritories = map.territories.map((t) => ({ ...t }));
  if (attackerWon) {
    newTerritories[targetId].ownerId = source.ownerId;
    newTerritories[targetId].dice = source.dice - 1;
    newTerritories[sourceId].dice = 1;
  } else {
    newTerritories[sourceId].dice = 1;
  }

  return {
    map: { ...map, territories: newTerritories },
    outcome: {
      attackerRolls,
      defenderRolls,
      attackerSum,
      defenderSum,
      attackerWon,
    },
  };
}
