/**
 * Personality + archetype model for v2.
 *
 * Two levels of vocabulary:
 *
 * 1. `PersonalityId` — what the NN's conditioning one-hot represents. Only
 *    archetypes we've trained reward shaping for can be conditioning IDs.
 *    Currently {optimizer, berserker}.
 *
 * 2. `ArchetypeId` — the user-facing "play style" labels (the full set we
 *    brainstormed). Every archetype resolves to a (personality, inference
 *    temperature) pair via the ARCHETYPES table. Untrained archetypes
 *    transparently fall back to optimizer until their reward shape is
 *    added and a fresh model is trained.
 *
 * Everything else in the codebase (color defaults, UI dropdowns, the
 * inference path) reads from ARCHETYPES — single source of truth.
 */

export const PERSONALITY_IDS = ["optimizer", "berserker"] as const;

export type PersonalityId = (typeof PERSONALITY_IDS)[number];

export const NUM_PERSONALITIES = PERSONALITY_IDS.length;

/** Index of `id` in PERSONALITY_IDS — used for one-hot encoding. */
export function personalityIndex(id: PersonalityId): number {
  return PERSONALITY_IDS.indexOf(id);
}

/**
 * The full set of archetypes brainstormed during v2 design, including ones
 * that aren't trained yet. Each entry pins the conditioning personality
 * the NN actually sees and the softmax temperature used at inference.
 * Untrained archetypes resolve to "optimizer" until we shape rewards and
 * retrain.
 */
export const ARCHETYPES = {
  optimizer: { personality: "optimizer", temp: 0, trained: true },
  berserker: { personality: "berserker", temp: 0, trained: true },
  builder: { personality: "optimizer", temp: 0, trained: false },
  coward: { personality: "optimizer", temp: 0, trained: false },
  kingmaker: { personality: "optimizer", temp: 0, trained: false },
  vengeful: { personality: "optimizer", temp: 0, trained: false },
  chaos: { personality: "optimizer", temp: 1.2, trained: false },
} as const;

export type ArchetypeId = keyof typeof ARCHETYPES;

export const ARCHETYPE_IDS: ReadonlyArray<ArchetypeId> = Object.keys(
  ARCHETYPES,
) as ArchetypeId[];

/**
 * Decided defaults from the brainstorm — one archetype per color. This is
 * the source of truth: UI dropdowns default to these, and so does any
 * code that needs a per-color personality without an override.
 */
export const COLOR_DEFAULT_ARCHETYPE: ReadonlyArray<ArchetypeId> = [
  "berserker", // 0: red
  "builder", //   1: green   (untrained — plays as optimizer for now)
  "coward", //    2: yellow  (untrained — plays as optimizer for now)
  "optimizer", // 3: blue
  "chaos", //     4: orange  (untrained reward, but expressed via temp)
  "kingmaker", // 5: purple  (untrained — plays as optimizer for now)
  "vengeful", //  6: cyan    (untrained — plays as optimizer for now)
];

/** Default archetype assigned to color `colorId`. */
export function defaultColorArchetype(colorId: number): ArchetypeId {
  return COLOR_DEFAULT_ARCHETYPE[colorId];
}

/** Conditioning personality for an archetype (what goes in the NN one-hot). */
export function archetypeToPersonality(arch: ArchetypeId): PersonalityId {
  return ARCHETYPES[arch].personality;
}

/** Inference softmax temperature for an archetype. */
export function archetypeToTemp(arch: ArchetypeId): number {
  return ARCHETYPES[arch].temp;
}

/** Default conditioning personality for color `colorId` (legacy helper). */
export function defaultColorPersonality(colorId: number): PersonalityId {
  return archetypeToPersonality(defaultColorArchetype(colorId));
}

/** Default inference temperature for color `colorId` (legacy helper). */
export function defaultColorInferenceTemp(colorId: number): number {
  return archetypeToTemp(defaultColorArchetype(colorId));
}

/** Pick a personality uniformly at random — used during training. */
export function randomPersonality(
  rng: () => number = Math.random,
): PersonalityId {
  return PERSONALITY_IDS[Math.floor(rng() * NUM_PERSONALITIES)];
}
