import {
  PERSONALITY_IDS,
  type PersonalityId,
} from "../model/personalities.ts";

/**
 * Per-decision context the reward function needs. Kept minimal so it can be
 * computed cheaply at every step without re-walking the board.
 */
export type DecisionContext = {
  isAttack: boolean;
  winProb: number;
};

type RewardFns = {
  /**
   * Dense per-decision shaping reward for the actor's chosen action. Tuned so
   * a typical game's cumulative shaping reward (~20-40 decisions) sits in the
   * same order of magnitude as the +1 terminal reward, keeping both signals
   * meaningful.
   */
  shaping: (ctx: DecisionContext) => number;
  /**
   * Terminal reward applied at game end, distributed evenly across all of
   * that seat's decisions. `rank` is 1 for the winner; 2..N for losers.
   */
  terminal: (rank: number) => number;
};

// Table-driven so adding a personality is one entry below, not two new
// `case` branches. Coverage is checked at compile time: PersonalityId is the
// union of PERSONALITY_IDS, and Record<PersonalityId, ...> demands every
// member be present.
const REWARDS: Record<PersonalityId, RewardFns> = {
  optimizer: {
    shaping: (ctx) => (ctx.isAttack ? 0.02 * ctx.winProb : 0),
    terminal: (rank) => (rank === 1 ? 1 : 0),
  },
  berserker: {
    shaping: (ctx) => (ctx.isAttack ? 0.05 + 0.05 * ctx.winProb : 0),
    terminal: (rank) => (rank === 1 ? 1 : 0),
  },
};

// Module-level sanity check that the table covers every trained personality.
// Catches drift between PERSONALITY_IDS and the table at module load.
for (const id of PERSONALITY_IDS) {
  if (!(id in REWARDS)) {
    throw new Error(`rewards.ts: missing reward fns for personality "${id}"`);
  }
}

export function shapingReward(
  personality: PersonalityId,
  ctx: DecisionContext,
): number {
  return REWARDS[personality].shaping(ctx);
}

export function terminalReward(
  personality: PersonalityId,
  rank: number,
): number {
  return REWARDS[personality].terminal(rank);
}
