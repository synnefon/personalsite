/* eslint-disable no-console */

// 1-second throttle: in-loop updates only print if at least this much wall
// time has passed since the previous progress/milestone call.
const MIN_INTERVAL_MS = 1000;
let lastTime = 0;

/**
 * Console.log only if at least 1 second has elapsed since the last
 * progress/milestone call. Use for chatty in-loop updates so stdout stays
 * readable on long-running scripts.
 */
export function progress(msg: string): void {
  const now = Date.now();
  if (now - lastTime < MIN_INTERVAL_MS) return;
  lastTime = now;
  console.log(msg);
}

/**
 * Console.log unconditionally and reset the throttle window. Use for
 * one-shot events that should always show (round/epoch boundaries, errors,
 * config dump, final summary).
 */
export function milestone(msg: string): void {
  lastTime = Date.now();
  console.log(msg);
}
