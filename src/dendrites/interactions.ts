import { Ball, CONFIG } from "./config.ts";
import { Sim, addStuck, createBall, touchesCluster } from "./engine.ts";

/**
 * The interaction layer — THIS IS YOUR PLAYGROUND.
 *
 * Called once per frame, after the free balls have moved, to decide what
 * happens when they meet the stuck cluster. It mutates `sim` only — all drawing
 * happens later, in drawSim.
 *
 * The default rule is diffusion-limited aggregation: a free ball that touches
 * the cluster sticks to it, and a fresh free ball is spawned to replace it, so
 * the dendrite keeps growing. Collisions are resolved against the cluster via
 * the spatial grid; free balls pass through one another.
 */
export function applyInteractions(
  sim: Sim,
  width: number,
  height: number,
): void {
  const newlyStuck: Ball[] = [];
  for (const ball of sim.free) {
    if (touchesCluster(sim, ball)) {
      ball.stuck = true;
      ball.color = CONFIG.stuckColor;
      newlyStuck.push(ball);
    }
  }
  if (newlyStuck.length === 0) return;

  // Commit after the scan: every ball this frame is tested against the same
  // cluster snapshot, and the grid is never mutated while it's being read.
  for (const ball of newlyStuck) addStuck(sim, ball);
  // Drop the balls that stuck, then spawn one fresh free ball for each.
  sim.free = sim.free.filter((ball) => !ball.stuck);
  for (let i = 0; i < newlyStuck.length; i++) {
    sim.free.push(createBall(width, height, false, true));
  }
}
