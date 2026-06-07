import { Ball, CONFIG } from "./config.ts";
import { createBall } from "./engine.ts";

// function elasticCollision(a: Ball, b: Ball): void {
//   // elastic collision
//   // same masses, so just swap velocities
//   const va1 = a.vx;
//   const va2 = a.vy;
//   const vb1 = b.vx;
//   const vb2 = b.vy;
//   a.vx = vb2;
//   a.vy = vb1;
//   b.vx = va2;
//   b.vy = va1;
// }

function stickyCollision(a: Ball, b: Ball): void {
  a.stuck = true;
  b.stuck = true;
  a.color = CONFIG.stuckColor;
  b.color = CONFIG.stuckColor;
}

/**
 * The interaction layer — THIS IS YOUR PLAYGROUND.
 *
 * Called once per frame, after the balls have moved and after the background
 * is cleared, but before the balls are drawn on top. Do whatever you like:
 * draw links, apply forces to `ball.vx` / `ball.vy`, spawn or remove balls.
 * The engine (movement + wall-bouncing, in engine.ts) doesn't need to change.
 *
 * The default below draws a faint line between every pair of balls that are
 * close together, fading it as they drift apart — the "dendrites".
 */
export function applyInteractions(
  balls: Ball[],
  width: number,
  height: number,
): void {
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distanceSq = dx * dx + dy * dy;
      const minDist = a.radius + b.radius;

      const collision = distanceSq <= minDist * minDist;
      if (!collision) continue;

      if (!a.stuck && !b.stuck) {
        // elasticCollision(a, b);
      } else if (a.stuck && b.stuck) {
        // both stuck, no need to recalculate anything
        continue;
      } else {
        stickyCollision(a, b);

        // if (Math.random() <= CONFIG.stickyProbability) {
        //   stickyCollision(a, b);
        // } else {
        //   elasticCollision(a, b);
        // }
        // spawn a new free ball
        balls.push(createBall(width, height, false, true));
      }
    }
  }
}
