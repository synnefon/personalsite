/**
 * Speed control utilities for the simulation
 */

import { SPEED } from "./constants.ts";
import { lerp } from "./physics.ts";

export function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Convert slider index to simulation speed value
 * Note: MIN=0 is special; idx 0 => frozen. idx 1..(STEPS-1) => (0..MAX] in log space.
 */
export function indexToSpeed(idx: number): number {
  if (idx <= 0) return 0;

  const steps = SPEED.STEPS;
  if (idx >= steps) return SPEED.MAX;

  // normalized position excluding 0
  const t = idx / steps; // idx=steps/2 => midpoint

  // calibrated so midpoint ≈ 0.5
  const targetMidSpeed = 0.5;
  const minPositive = (targetMidSpeed * targetMidSpeed) / SPEED.MAX;

  const minLog = Math.log(minPositive);
  const maxLog = Math.log(SPEED.MAX);

  return Math.exp(lerp(minLog, maxLog, t));
}

/**
 * Find the slider index closest to the given speed value
 */
export function speedToNearestIndex(speed: number): number {
  if (speed <= 0) return 0;

  const steps = SPEED.STEPS;
  const last = steps - 1;

  let best = 1;
  let bestErr = Infinity;
  const target = Math.log(speed);

  for (let i = 1; i <= last; i++) {
    const s = indexToSpeed(i);
    const err = Math.abs(Math.log(s) - target);
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  return best;
}
