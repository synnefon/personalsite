import { Ball, CONFIG } from "./config.ts";

/*
  The engine: spawning, movement, wall-bouncing, and rendering.

  Stuck balls never move, so they're kept in two structures that keep the hot
  path cheap as the dendrite grows:
    - a spatial-hash `grid`, so a free ball only tests the handful of stuck
      balls in neighbouring cells instead of the whole cluster (collision is
      O(free) per frame instead of O(total^2));
    - an offscreen `cluster` canvas they're painted onto once when they stick,
      so each frame blits a single image instead of re-stroking every stuck
      ball (drawing is O(free) per frame too).

  The interaction logic (what happens when balls touch) lives in interactions.ts.
*/

/** A free ball plus the stuck cluster, indexed for cheap collision and drawing. */
export type Sim = {
  /** Moving balls; tested against the cluster every frame. */
  free: Ball[];
  /** Stuck balls bucketed by grid cell. */
  grid: Map<number, Ball[]>;
  /** Cell size in CSS px. >= any free+stuck radius sum, so a 3x3 search is exhaustive. */
  cellSize: number;
  /** Offscreen layer holding the rendered cluster, blitted each frame. */
  cluster: HTMLCanvasElement;
  clusterCtx: CanvasRenderingContext2D;
};

// Grid keys pack (cx, cy) into one number. Ball coordinates stay within the
// canvas, so cx and cy are non-negative and cy stays well below the stride.
const GRID_STRIDE = 100000;

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

/** Spawn a fresh set of balls: one stuck seed plus a scatter of free balls. */
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
      CONFIG.sourceBallRadius,
    ),
  );
  for (let i = 1; i < CONFIG.ballCount; i++) {
    balls.push(createBall(width, height, false, false));
  }
  return balls;
}

/** Draw a single ball as a filled circle into the given context. */
function drawBall(ctx: CanvasRenderingContext2D, ball: Ball): void {
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color;
  ctx.fill();
}

/** Size the offscreen cluster layer to match the canvas, then repaint it. */
function sizeCluster(
  sim: Sim,
  width: number,
  height: number,
  dpr: number,
): void {
  // Setting width/height also clears the backing store, so repaint afterwards.
  sim.cluster.width = Math.round(width * dpr);
  sim.cluster.height = Math.round(height * dpr);
  sim.clusterCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const cell of sim.grid.values()) {
    for (const ball of cell) drawBall(sim.clusterCtx, ball);
  }
}

/** Add a now-stuck ball to the spatial grid and paint it onto the cluster layer. */
export function addStuck(sim: Sim, ball: Ball): void {
  const cx = Math.floor(ball.x / sim.cellSize);
  const cy = Math.floor(ball.y / sim.cellSize);
  const key = cx * GRID_STRIDE + cy;
  const cell = sim.grid.get(key);
  if (cell) cell.push(ball);
  else sim.grid.set(key, [ball]);
  drawBall(sim.clusterCtx, ball);
}

/** True if `ball` overlaps any stuck ball, found via the spatial grid. */
export function touchesCluster(sim: Sim, ball: Ball): boolean {
  const cx = Math.floor(ball.x / sim.cellSize);
  const cy = Math.floor(ball.y / sim.cellSize);
  // cellSize >= any radius sum, so a colliding stuck ball is in the 3x3 block.
  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const cell = sim.grid.get(gx * GRID_STRIDE + gy);
      if (!cell) continue;
      for (const s of cell) {
        const dx = ball.x - s.x;
        const dy = ball.y - s.y;
        const minDist = ball.radius + s.radius;
        if (dx * dx + dy * dy <= minDist * minDist) return true;
      }
    }
  }
  return false;
}

/** Build a fresh simulation: free balls scattered about, the seed in the cluster. */
export function createSim(width: number, height: number, dpr: number): Sim {
  const balls = createBalls(width, height);
  const maxRadius = balls.reduce((m, b) => Math.max(m, b.radius), 0);
  const cluster = document.createElement("canvas");
  const clusterCtx = cluster.getContext("2d");
  if (!clusterCtx) throw new Error("dendrites: 2d context unavailable");

  const sim: Sim = {
    free: [],
    grid: new Map(),
    cellSize: 2 * maxRadius,
    cluster,
    clusterCtx,
  };
  sizeCluster(sim, width, height, dpr);
  for (const ball of balls) {
    if (ball.stuck) addStuck(sim, ball);
    else sim.free.push(ball);
  }
  return sim;
}

/** Resize the cluster layer (and repaint it) after the canvas changes size. */
export function resizeSim(
  sim: Sim,
  width: number,
  height: number,
  dpr: number,
): void {
  sizeCluster(sim, width, height, dpr);
}

/**
 * Advance every free ball one step and recycle it off the right wall.
 * `dt` is normalized to 60fps frames (1 === one 60fps frame).
 */
export function stepSim(
  sim: Sim,
  width: number,
  height: number,
  dt: number,
): void {
  for (const ball of sim.free) {
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

/** Clear the canvas, blit the cluster layer, then draw the free balls on top. */
export function drawSim(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  width: number,
  height: number,
): void {
  ctx.fillStyle = CONFIG.background;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(sim.cluster, 0, 0, width, height);
  for (const ball of sim.free) drawBall(ctx, ball);
}
