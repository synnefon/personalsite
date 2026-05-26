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
  baseline = "Baseline",
  conqueror = "Conqueror",
  builder = "Builder",
  lurker = "Lurker",
  consolidator = "Consolidator",
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
 *   attackFear — scales the base threshold from `policy.ts:
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
  /** Drive to grow your largest army. Rewards any attack that would
   *  expand your largest connected territory on success, ignoring how
   *  likely the attack itself is to land. Positive = expansionist;
   *  negative = wants to stay small / lay low. */
  growthDrive?: number;
  /** Drive for safe-AND-held captures. Rewards confident attacks on
   *  targets unlikely to be retaken next turn. Positive = cherry-picks
   *  safe ground; negative = avoids easy captures. */
  holdDrive?: number;
  /** Drive for confident expansion only. Same growth signal as
   *  `growthDrive`, gated by attack-success probability — only fires on
   *  sure-win link-ups. The patient mass-builder. */
  safeGrowthDrive?: number;
  /** Drive to fracture opponents — rewards confident attacks that shrink
   *  the target owner's largest connected region (their reinforcement
   *  income). Gated by attack-success probability. */
  enemyHarmDrive?: number;
  /** Fear of exposed borders. Rewards attacks that reduce the actor's
   *  own frontier-edge count (perimeter consolidation). Higher = more
   *  willing to take captures purely to tighten shape. */
  exposureFear?: number;
  /** Drive to hunt the weakest alive opponent. Gated by attack-success
   *  probability. Positive = predator (hunt weak); negative = kingmaker
   *  (challenge the leader). */
  preyOnWeak?: number;
};

export type ArchetypeBehavior = {
  attackFear: number;
  samplingTemp: number;
  lookaheadDepth: LOOKAHEAD;
  biases?: BiasCoeffs;
};

export const ARCHETYPE_BEHAVIOR: Record<ArchetypeId, ArchetypeBehavior> = {
  [ARCHETYPES.baseline]: {
    attackFear: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // No biases — the baseline trained V is what baseline is.
  },
  [ARCHETYPES.conqueror]: {
    attackFear: 0.6,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Conqueror: unconditional growth — rewards any attack that would
    // grow your largest army, including low-winProb gambles. Combined
    // with the lowered attackFear this makes it the aggressive risk-taker.
    biases: { growthDrive: 0.1 },
  },
  [ARCHETYPES.builder]: {
    attackFear: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Builder: confident growth — same mass-building signal as Conqueror
    // but gated by winProb. Patient construction; only consolidates when
    // the link-up is a clear win.
    biases: { safeGrowthDrive: 0.1 },
  },
  [ARCHETYPES.lurker]: {
    attackFear: 1.4,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Sniper: only confident-AND-safe captures score.
    biases: { holdDrive: 0.1 },
  },
  [ARCHETYPES.consolidator]: {
    attackFear: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Rewards attacks that reduce the actor's own frontier-edge count
    // — consolidation by perimeter. Distinct from `growthDrive`, which
    // measures the *size* of your largest piece; this measures how
    // exposed it is.
    biases: { exposureFear: 0.1 },
  },
  [ARCHETYPES.predator]: {
    attackFear: 1,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Predator: hunt the weakest alive enemy, avoid the leader. winProb-
    // gated so we don't chase fortified spots inside an otherwise-weak
    // player's territory. Positive `preyOnWeak` = hunt weak; a negative
    // coefficient would be kingmaker (challenge the leader).
    biases: { preyOnWeak: 0.20 },
  },
  [ARCHETYPES.disruptor]: {
    attackFear: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
    // Disruptor: confident-AND-disruptive captures. winProb gating
    // keeps it from chasing fracture moves it can't actually land.
    biases: { enemyHarmDrive: 0.20 },
  },
};

/**
 * Short human-readable description of each archetype's play style.
 * Used as tooltip text in the UI (score panel & setup dropdown).
 */
export const ARCHETYPE_DESCRIPTIONS: Record<ArchetypeId, string> = {
  [ARCHETYPES.baseline]: "Plays the trained value network straight — no bias.",
  [ARCHETYPES.conqueror]:
    "Aggressive empire-builder; takes risky link-ups to grow the largest army.",
  [ARCHETYPES.builder]:
    "Patient empire-builder; only consolidates on confident captures.",
  [ARCHETYPES.lurker]:
    "Only strikes when both the attack and the hold are very likely.",
  [ARCHETYPES.consolidator]:
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
  [COLOR_NAME.red]: ARCHETYPES.conqueror,
  [COLOR_NAME.green]: ARCHETYPES.builder,
  [COLOR_NAME.yellow]: ARCHETYPES.lurker,
  [COLOR_NAME.blue]: ARCHETYPES.baseline,
  [COLOR_NAME.orange]: ARCHETYPES.disruptor,
  [COLOR_NAME.purple]: ARCHETYPES.consolidator,
  [COLOR_NAME.cyan]: ARCHETYPES.predator,
};

/** Default archetype assigned to color `colorId`. */
export function defaultColorArchetype(colorId: number): ArchetypeId {
  return COLOR_DEFAULT_ARCHETYPE[PLAYER_COLORS[colorId].name];
}
