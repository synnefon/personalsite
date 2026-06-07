import { Ball, CONFIG } from "./config.ts";

/*
  The engine: spawning, movement, wall-bouncing, and drawing the balls.
  This is the part you most likely won't need to touch — the interaction
  logic lives in interactions.ts.
*/

/** Random float in [min, max). */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randStartVelocity(): { vx: number; vy: number } {
  // always move towards the center of the canvas, plus or minus a random angle
  // const dx = 1;
  // const dy = 0;
  // const angle = Math.atan2(dy, dx);
  // const speed = randRange(CONFIG.minSpeed, CONFIG.maxSpeed);
  return { vx: CONFIG.ballSpeed, vy: 0 };
}

function randStartPosition(
  width: number,
  height: number,
  offscreen: boolean,
): { x: number; y: number } {
  // start offscreen, randomly on the left or right, and randomly on the top or bottom
  // always start on the left side of the canvas
  if (offscreen) {
    return { x: 0, y: randRange(0, height) };
  } else {
    return { x: randRange(0, width), y: randRange(0, height) };
  }
}

export function createBall(
  width: number,
  height: number,
  stuck: boolean,
  offscreen: boolean,
  startPosition?: { x: number; y: number },
  radius?: number,
): Ball {
  const r = radius ?? CONFIG.ballRadius;
  const { x, y } = startPosition ?? randStartPosition(width, height, offscreen);
  const { vx, vy } = randStartVelocity();
  const color = stuck ? CONFIG.stuckColor : CONFIG.freeColor;
  return { x, y, vx, vy, radius: r, color, stuck };
}

/** Spawn a fresh set of balls scattered across the given area. */
export function createBalls(width: number, height: number): Ball[] {
  const balls: Ball[] = [];
  balls.push(
    createBall(
      width,
      height,
      true,
      false,
      {
        x: width - width / 10,
        y: height / 2,
      },
      7,
    ),
  );
  for (let i = 1; i < CONFIG.ballCount; i++) {
    balls.push(createBall(width, height, false, false));
  }
  return balls;
}

/**
 * Advance every ball one step and bounce it off the walls.
 * `dt` is normalized to 60fps frames (1 === one 60fps frame).
 */
export function stepBalls(
  balls: Ball[],
  width: number,
  height: number,
  dt: number,
): void {
  for (const ball of balls) {
    if (ball.stuck) continue;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x + ball.radius > width) {
      const { x, y } = randStartPosition(width, height, true);
      const { vx, vy } = randStartVelocity();
      ball.x = x;
      ball.y = y;
      ball.vx = vx;
      ball.vy = vy;
    }
  }
}

/** Draw every ball as a filled circle. */
export function drawBalls(ctx: CanvasRenderingContext2D, balls: Ball[]): void {
  for (const ball of balls) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
  }
}
