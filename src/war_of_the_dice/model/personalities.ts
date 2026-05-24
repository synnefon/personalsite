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

export enum ARCHETYPES {
  optimizer = "optimizer",
  berserker = "berserker",
  builder = "builder",
  coward = "coward",
  kingmaker = "kingmaker",
  vengeful = "vengeful",
  chaos = "chaos",
}

export type ArchetypeId = keyof typeof ARCHETYPES;

export const ARCHETYPE_IDS: ReadonlyArray<ArchetypeId> = Object.keys(
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
 * std ≈ 0.26 — biases at 0.05–0.15 are "visible but not overwhelming".
 *
 *   thresholdMultiplier — scales the base threshold from `policy.ts:
 *     decisionThreshold` (lerps 0.4 → 0.2 as players are eliminated).
 *     Lower = more aggressive; higher = more passive.
 *
 *   samplingTemp — when > 0, softmax-samples over Q values at this
 *     temperature instead of taking argmax. Threshold + override are
 *     skipped in sampling mode.
 *
 *   lookaheadDepth — how many moves ahead to consider.
 */
export type ArchetypeBehavior = {
  thresholdMultiplier: number;
  samplingTemp: number;
  /**
   * 1 = no lookahead (evaluate this attack only).
   * 2 = consider one more move after this one.
   * 3 = two more moves ahead.
   */
  lookaheadDepth: LOOKAHEAD;
};

// Aggression overrides are disabled — all archetypes use the trained
// model's natural threshold (multiplier 1.0) so we can observe pure
// self-play V behavior. Differentiation comes from lookahead depth
// (planning horizon) and, for Chaos, softmax sampling.
export const ARCHETYPE_BEHAVIOR: Record<ArchetypeId, ArchetypeBehavior> = {
  [ARCHETYPES.berserker]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
  },
  [ARCHETYPES.vengeful]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
  },
  [ARCHETYPES.coward]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
  },
  [ARCHETYPES.kingmaker]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
  },
  [ARCHETYPES.chaos]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 1.2,
    lookaheadDepth: LOOKAHEAD.DEEP,
  },
  [ARCHETYPES.builder]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
  },
  [ARCHETYPES.optimizer]: {
    thresholdMultiplier: 1.0,
    samplingTemp: 0,
    lookaheadDepth: LOOKAHEAD.DEEP,
  },
};

/**
 * Per-color default archetype. UI dropdowns initialize to these.
 */
export const COLOR_DEFAULT_ARCHETYPE: Record<COLOR_NAME, ArchetypeId> = {
  [COLOR_NAME.red]: ARCHETYPES.berserker,
  [COLOR_NAME.green]: ARCHETYPES.builder,
  [COLOR_NAME.yellow]: ARCHETYPES.coward,
  [COLOR_NAME.blue]: ARCHETYPES.optimizer,
  [COLOR_NAME.orange]: ARCHETYPES.chaos,
  [COLOR_NAME.purple]: ARCHETYPES.kingmaker,
  [COLOR_NAME.cyan]: ARCHETYPES.vengeful,
};

/** Default archetype assigned to color `colorId`. */
export function defaultColorArchetype(colorId: number): ArchetypeId {
  return COLOR_DEFAULT_ARCHETYPE[PLAYER_COLORS[colorId].name];
}
