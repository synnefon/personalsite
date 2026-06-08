/**
 * Flow direction of the balls across the canvas. 
 * LR = left→right
 * RL = right→left
 * TB = top→bottom
 * BT = bottom→top
 */
export enum Direction {
  LR = "LR",
  RL = "RL",
  TB = "TB",
  BT = "BT",
}

/**
 * Clockwise turns.
 */
export enum Turn {
  oneQuarter = "oneQuarter",
  half = "half",
  threeQuarters = "threeQuarters",
  noop = "noop",
}

/** Tunable knobs for the simulation. Tweak freely. */
export const CONFIG = {
  /** How many balls to spawn. */
  ballCount: 500,
  /** Radius range (px). */
  ballRadius: 3.5,
  sourceBallRadius: 6,
  /** Min free-ball radius (slider floor); connection blips play unshifted here. */
  minBallRadius: 2,
  /** Max free-ball radius (slider cap); the collision grid's cellSize is sized for this. */
  maxBallRadius: 10,
  /** Per-axis speed range (px per 60fps frame). */
  ballSpeed: 5,
  /** Probability of a sticky collision when a free ball collides with the dendrite.*/
  stickyProbability: 1,
  /** Canvas background (--color-purple-dark). */
  background: "white",
  /** Ball colors, sampled at random. Mirrors the palette in styles/index.css. */
  stuckColor: "black",
  freeColor: "gray",
  sourceBallColor: "red",
} as const;
