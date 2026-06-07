/** A single ball in the simulation. Position/velocity are in CSS pixels. */
export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  stuck: boolean;
};

/** Tunable knobs for the simulation. Tweak freely. */
export const CONFIG = {
  /** How many balls to spawn. */
  ballCount: 500,
  /** Radius range (px). */
  ballRadius: 3.5,
  sourceBallRadius: 3.5,
  /** Per-axis speed range (px per 60fps frame). */
  ballSpeed: 5,
  /** Probability of a sticky collision when a free ball collides with the dendrite.*/
  stickyProbability: 1,
  /** Canvas background (--color-purple-dark). */
  background: "white",
  /** Ball colors, sampled at random. Mirrors the palette in styles/index.css. */
  stuckColor: "black",
  freeColor: "gray",
} as const;
