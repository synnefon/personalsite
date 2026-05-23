import { MAX_DICE_PER_TERRITORY } from "./constants.ts";
import { largestComponent } from "./gameLogic.ts";
import type { GameMap } from "./types.ts";

/**
 * Whether the source territory can launch an attack on the target. Requires
 * different owners, source.dice >= 2, and adjacency.
 */
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

/** Roll `count` six-sided dice and return the individual results. */
function rollDice(count: number, rng: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(1 + Math.floor(rng() * 6));
  return out;
}

/** Sum of array elements. */
function sum(arr: ReadonlyArray<number>): number {
  let s = 0;
  for (const n of arr) s += n;
  return s;
}

/**
 * Roll dice for both sides and apply the outcome. Attacker wins on ties.
 * On success, attacker's surviving dice move to the captured territory and
 * the source drops to 1. On failure, source drops to 1, defender unchanged.
 */
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

/**
 * Hypothetical post-attack map assuming the attack SUCCEEDS. Defender's
 * territory becomes attacker-owned with `source.dice − 1` dice; source
 * drops to 1. Pure, no RNG. Used by the value-network decision rule to
 * estimate `V(s_success)` without rolling dice.
 */
export function simulateAttackSuccess(
  map: GameMap,
  sourceId: number,
  targetId: number,
): GameMap {
  const newTerritories = map.territories.map((t) => ({ ...t }));
  const source = newTerritories[sourceId];
  newTerritories[targetId].ownerId = source.ownerId;
  newTerritories[targetId].dice = source.dice - 1;
  source.dice = 1;
  return { ...map, territories: newTerritories };
}

/**
 * Hypothetical post-attack map assuming the attack FAILS. Source drops to
 * 1; target unchanged. Pure, no RNG. Used by the value-network decision
 * rule to estimate `V(s_fail)`.
 */
export function simulateAttackFail(
  map: GameMap,
  sourceId: number,
  _targetId: number,
): GameMap {
  const newTerritories = map.territories.map((t) => ({ ...t }));
  newTerritories[sourceId].dice = 1;
  return { ...map, territories: newTerritories };
}

/**
 * Deterministic end-of-turn reinforcement projection for `playerId`. Adds
 * `largestComponent(map, playerId)` dice across their owned territories
 * via round-robin (capped at MAX_DICE_PER_TERRITORY), matching the
 * reinforcement loop in `reinforcement.ts` but replacing the random
 * scatter with a stable order.
 *
 * Used by the V-lookahead decision rule: the thesis's WPM-D agent
 * projects through end-of-turn reinforcement so the value comparison
 * reflects the *real* delta from an attack (dice lost in battle, but
 * also dice gained from the resulting score). Without this projection,
 * every attack looks locally net-negative and the policy collapses to
 * pass.
 */
export function simulateReinforcement(
  map: GameMap,
  playerId: number,
): GameMap {
  const score = largestComponent(map, playerId);
  if (score === 0) return map;

  const owned: number[] = [];
  for (let i = 0; i < map.territories.length; i++) {
    if (map.territories[i].ownerId === playerId) owned.push(i);
  }
  if (owned.length === 0) return map;

  const newTerritories = map.territories.map((t) => ({ ...t }));
  let remaining = score;
  let madeProgress = true;
  while (remaining > 0 && madeProgress) {
    madeProgress = false;
    for (const idx of owned) {
      if (remaining === 0) break;
      if (newTerritories[idx].dice < MAX_DICE_PER_TERRITORY) {
        newTerritories[idx].dice++;
        remaining--;
        madeProgress = true;
      }
    }
  }

  return { ...map, territories: newTerritories };
}
