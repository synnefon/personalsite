/**
 * Archetype taxonomy — the user-facing "play style" labels.
 *
 * Each archetype maps to an inference-time softmax temperature. With the
 * current value-network architecture, the model itself is not conditioned
 * on archetype: all archetypes with `temp = 0` play identically (argmax
 * over expected V). The "Chaos" archetype is the only one with visible
 * behavioral differentiation, expressed via `temp > 0` stochastic
 * sampling.
 *
 * TODO: behavioral differentiation between non-Chaos archetypes is on the
 * roadmap and would require either (a) one trained model per archetype,
 * or (b) re-introducing personality conditioning into the encoder with
 * an actual training signal that differentiates them. Currently every
 * non-Chaos color plays as the same value model.
 */
export const ARCHETYPES = {
  optimizer: { temp: 0 },
  berserker: { temp: 0 },
  builder: { temp: 0 },
  coward: { temp: 0 },
  kingmaker: { temp: 0 },
  vengeful: { temp: 0 },
  chaos: { temp: 1.2 },
} as const;

export type ArchetypeId = keyof typeof ARCHETYPES;

export const ARCHETYPE_IDS: ReadonlyArray<ArchetypeId> = Object.keys(
  ARCHETYPES,
) as ArchetypeId[];

/**
 * Per-color default archetype. UI dropdowns initialize to these.
 */
export const COLOR_DEFAULT_ARCHETYPE: ReadonlyArray<ArchetypeId> = [
  "berserker", // 0: red
  "builder", //   1: green
  "coward", //    2: yellow
  "optimizer", // 3: blue
  "chaos", //     4: orange
  "kingmaker", // 5: purple
  "vengeful", //  6: cyan
];

/** Default archetype assigned to color `colorId`. */
export function defaultColorArchetype(colorId: number): ArchetypeId {
  return COLOR_DEFAULT_ARCHETYPE[colorId];
}

/** Inference softmax temperature for an archetype. */
export function archetypeToTemp(arch: ArchetypeId): number {
  return ARCHETYPES[arch].temp;
}
