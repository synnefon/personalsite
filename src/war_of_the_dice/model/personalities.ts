/**
 * Archetype taxonomy — the user-facing "play style" labels.
 *
 * All archetypes share the same trained value network. Per-archetype
 * behavioral differentiation is expressed via decision-rule modifiers
 * (threshold scale + per-candidate Q bias + sampling temperature) layered
 * on top of the baseline V-lookahead policy. See `policy.ts` for the
 * actual modifier application.
 */

import { COLOR_NAME, PLAYER_COLORS } from "../constants.ts";

/**
 * Archetype IDs. The enum values are the user-facing display names —
 * single source of truth, used directly in UI dropdowns. To rename an
 * archetype: change the value here and everything downstream picks it up.
 */
export enum ARCHETYPES {
  optimizer = "Optimizer",
  berserker = "Berserker",
  builder = "Builder",
  coward = "Coward",
  expander = "Expander",
  predator = "Predator",
  disruptor = "Disruptor",
}

export type ArchetypeId = `${ARCHETYPES}`;

export const ARCHETYPE_IDS: ReadonlyArray<ArchetypeId> = Object.values(
  ARCHETYPES,
) as ArchetypeId[];

export enum LOOKAHEAD {
  SHALLOW = 1,
  MODERATE = 2,
  DEEP = 3,
}

/**
 * Per-archetype decision-rule modifiers. Magnitudes calibrated from the
 * trained model's empirical Q-distribution (see `calibrate.ts` output):
 * decision-margin (Q gap between best attack and pass) has mean ≈ 0.26,
 * std ≈ 0.26 — biases at 0.05–0.25 are "visible but not overwhelming".
 *
 *   thresholdMultiplier — scales the base threshold from `policy.ts:
 *     decisionThreshold` (lerps 0.15 → 0.05 as players are eliminated).
 *     Lower = more aggressive; higher = more passive.
 *
 *   samplingTemp — when > 0, softmax-samples over Q values at this
 *     temperature instead of taking argmax. Threshold + override are
 *     skipped in sampling mode.
 *
 *   lookaheadDepth — how many moves ahead to consider when scoring
 *     each candidate (1 = none, 3 = full depth).
 *
 *   biases — per-candidate Q adjustments. Each non-zero field defines a
 *     coefficient applied to a normalized per-candidate signal; the
 *     archetype's total bias is the sum. Omitted fields default to 0
 *     (no contribution). See `policy.ts:archetypeBias` for application.
 */
export type BiasCoeffs = {
  /** Coefficient on candidate's win probability ∈ [0, 1]. */
  winProb?: number;
  /** Coefficient on Δ-largest-component (actor's largest-component growth
   *  on attack success). Roughly ∈ [0, 8] in practice. */
  deltaLargest?: number;
  /** Coefficient on capture hold probability ∈ [0, 1]. */
  holdProb?: number;
  /** Coefficient applied to a [-1, +1] target-rank signal: -c for
   *  attacking the weakest alive enemy, +c for the strongest, linear in
   *  between. Encodes kingmaker-style "spare the weak, hit the leader". */
  rankSpread?: number;
  /** Flat coefficient added when target's owner is in `recentAttackers`
   *  (Vengeful retaliation). */
  retaliation?: number;
  /** Coefficient on `winProb × holdProb` — only confident-AND-safe
   *  captures score high. Sniper signal. */
  winProbHold?: number;
  /** Coefficient on `winProb × deltaLargest` — only confident-AND-
   *  consolidating captures score high. Opportunist signal. */
  winProbLargest?: number;
  /** Coefficient on the target owner's largest-component shrinkage on
   *  attack success — rewards attacks that fracture an opponent's
   *  reinforcement income. Disruptor signal. */
  enemyLargestShrink?: number;
  /** Coefficient on actor's own frontier-edge reduction on attack
   *  success — rewards attacks that consolidate territory by removing
   *  border length. Expander signal; complements `deltaLargest` but
   *  measures perimeter rather than mass. */
  frontierShrink?: number;
};

export type ArchetypeBehavior = {
  thresholdMultiplier: number;
  samplingTemp: number;
  lookaheadDepth: LOOKAHEAD;
  biases?: BiasCoeffs;
};

export const ARCHETYPE_BEHAVIOR: Record<ArchetypeId, ArchetypeBehavior> = {
  [ARCHETYPES.optimizer]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // No biases — the baseline trained V is what optimizer is.
  },
  [ARCHETYPES.berserker]: {
    thresholdMultiplier: 0.6,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Opportunist: rewards attacks that are both high-confidence AND
    // growth-positive. Filters the self-play model's positional choices
    // through "is this also a clear win?".
    biases: { winProbLargest: 0.1 },
  },
  [ARCHETYPES.builder]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    biases: { deltaLargest: 0.1 },
  },
  [ARCHETYPES.coward]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Sniper: only confident-AND-safe captures score. Stacks two filters
    // multiplicatively — a 0.6 winProb × 0.6 holdProb capture only gets
    // 0.04 boost, but a 0.9×0.9 capture gets 0.08. Selective but not so
    // restrictive that it suppresses moves the baseline V already likes
    // (n=100 round-robin showed 0.20 dropped Coward below baseline).
    biases: { winProbHold: 0.1 },
  },
  [ARCHETYPES.expander]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Rewards attacks that reduce the actor's own frontier-edge count
    // — consolidation by perimeter. Distinct from `deltaLargest`, which
    // measures the *size* of your largest piece; this measures how
    // exposed it is.
    biases: { frontierShrink: 0.1 },
  },
  [ARCHETYPES.predator]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Anti-Kingmaker: rankSpread is negative, so attacking the weakest
    // alive enemy gets +0.15 and attacking the strongest gets −0.15.
    // Round-robin hypothesis: eating weak opponents converts to wins
    // more cleanly than pressuring the leader.
    biases: { rankSpread: -0.15 },
  },
  [ARCHETYPES.disruptor]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Disruptor: rewards attacks that fracture an opponent's largest
    // connected region — each die of shrinkage in their score reduces
    // their next-turn reinforcement. Typical value 0-3, with rare merger-
    // cleaving moves landing 5+. Coefficient 0.15 makes typical fracture
    // contribute 0.15-0.45.
    biases: { enemyLargestShrink: 0.15 },
  },
};

/**
 * Short human-readable description of each archetype's play style.
 * Used as tooltip text in the UI (score panel & setup dropdown).
 */
export const ARCHETYPE_DESCRIPTIONS: Record<ArchetypeId, string> = {
  [ARCHETYPES.optimizer]: "Plays the trained value network straight — no bias.",
  [ARCHETYPES.berserker]:
    "Favors confident attacks that also grow the largest army.",
  [ARCHETYPES.builder]:
    "Favors attacks that grow the largest connected territory.",
  [ARCHETYPES.coward]:
    "Only strikes when both the attack and the hold are very likely.",
  [ARCHETYPES.expander]:
    "Favors attacks that shrink the actor's exposed border.",
  [ARCHETYPES.predator]:
    "Picks on the weakest opponent; avoids confronting the leader.",
  [ARCHETYPES.disruptor]:
    "Targets attacks that fracture an opponent's largest army.",
};

/**
 * Per-color default archetype. UI dropdowns initialize to these.
 */
export const COLOR_DEFAULT_ARCHETYPE: Record<COLOR_NAME, ArchetypeId> = {
  [COLOR_NAME.red]: ARCHETYPES.berserker,
  [COLOR_NAME.green]: ARCHETYPES.builder,
  [COLOR_NAME.yellow]: ARCHETYPES.coward,
  [COLOR_NAME.blue]: ARCHETYPES.optimizer,
  [COLOR_NAME.orange]: ARCHETYPES.disruptor,
  [COLOR_NAME.purple]: ARCHETYPES.expander,
  [COLOR_NAME.cyan]: ARCHETYPES.predator,
};

/** Default archetype assigned to color `colorId`. */
export function defaultColorArchetype(colorId: number): ArchetypeId {
  return COLOR_DEFAULT_ARCHETYPE[PLAYER_COLORS[colorId].name];
}
