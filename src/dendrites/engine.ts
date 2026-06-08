import { CONFIG, Direction } from "./config.ts";
import { Ball, Sim } from "./types.ts";

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

// Grid keys pack (cx, cy) into one number. Ball coordinates stay within the
// canvas, so cx and cy are non-negative and cy stays well below the stride.
const GRID_STRIDE = 100000;

/** Random float in [min, max). */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randStartVelocity(direction: Direction): { vx: number; vy: number } {
  // always move towards the center of the canvas, plus or minus a random angle
  // const dx = 1;
  // const dy = 0;
  // const angle = Math.atan2(dy, dx);
  // const speed = randRange(CONFIG.minSpeed, CONFIG.maxSpeed);
  switch (direction) {
    case Direction.LR:
      return { vx: CONFIG.ballSpeed, vy: 0 };
    case Direction.RL:
      return { vx: -CONFIG.ballSpeed, vy: 0 };
    case Direction.TB:
      return { vx: 0, vy: CONFIG.ballSpeed };
    case Direction.BT:
      return { vx: 0, vy: -CONFIG.ballSpeed };
  }
}

function randStartPosition({
  width,
  height,
  direction,
  offset = false,
}: {
  width: number;
  height: number;
  direction: Direction;
  offset?: boolean;
}): { x: number; y: number } {
  const randX = randRange(0, width);
  const randY = randRange(0, height);

  let bPos = { x: 0, y: 0 };
  switch (direction) {
    case Direction.LR:
      bPos = { x: 0, y: randY };
      break;
    case Direction.RL:
      bPos = { x: width, y: randY };
      break;
    case Direction.TB:
      bPos = { x: randX, y: 0 };
      break;
    case Direction.BT:
      bPos = { x: randX, y: height };
      break;
  }

  if (offset) {
    switch (direction) {
      case Direction.LR:
        bPos.x = 0 - (width - bPos.x);
        break;
      case Direction.RL:
        bPos.x = width + bPos.x;
        break;
      case Direction.TB:
        bPos.y = 0 - (height - bPos.y);
        break;
      case Direction.BT:
        bPos.y = height + bPos.y;
        break;
    }
  }
  return bPos;
}

type ballOptions = {
  startPosition?: { x: number; y: number };
  radius?: number;
  direction: Direction;
  stuck?: boolean;
};
export function createBall(
  width: number,
  height: number,
  opts: ballOptions,
): Ball {
  const { startPosition, radius, direction, stuck } = opts;
  const r = radius ?? CONFIG.ballRadius;
  const { x, y } =
    startPosition ??
    randStartPosition({
      width,
      height,
      direction,
    });
  const offScreen = isOffscreen(x, y, r, width, height);
  const { vx, vy } = randStartVelocity(direction);
  const color = stuck ? CONFIG.stuckColor : CONFIG.freeColor;
  return {
    x,
    y,
    vx,
    vy,
    radius: r,
    color,
    stuck: stuck ?? false,
    appeared: !offScreen,
  };
}

/** Spawn a fresh set of balls: one stuck seed plus a scatter of free balls. */
export function createBalls(
  width: number,
  height: number,
  direction: Direction,
): Ball[] {
  const balls: Ball[] = [];

  balls.push({
    x: width / 2,
    y: height / 2,
    vx: 0,
    vy: 0,
    radius: CONFIG.sourceBallRadius,
    color: CONFIG.sourceBallColor,
    stuck: true,
    appeared: true,
  });

  for (let i = 1; i < CONFIG.ballCount; i++) {
    balls.push(
      createBall(width, height, {
        direction,
        stuck: false,
        startPosition: { x: randRange(0, width), y: randRange(0, height) },
      }),
    );
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
export function initializeSim({
  width,
  height,
  dpr,
  direction,
}: {
  width: number;
  height: number;
  dpr: number;
  direction: Direction;
}): Sim {
  const balls = createBalls(width, height, direction);
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
    keepGenerating: true,
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

function isBallOffscreen(ball: Ball, width: number, height: number): boolean {
  return isOffscreen(ball.x, ball.y, ball.radius, width, height);
}

function isOffscreen(
  x: number,
  y: number,
  radius: number,
  width: number,
  height: number,
): boolean {
  return (
    x + radius < 0 ||
    x - radius > width ||
    y + radius < 0 ||
    y - radius > height
  );
}

function shouldStopGenerating(
  ball: Ball,
  width: number,
  height: number,
): boolean {
  return (
    ball.x <= width / 20 ||
    ball.x >= width - width / 20 ||
    ball.y <= height / 20 ||
    ball.y >= height - height / 20
  );
}

function resetBall(
  ball: Ball,
  width: number,
  height: number,
  direction: Direction,
): Ball {
  const { x, y } = randStartPosition({
    width,
    height,
    direction,
    offset: false,
  });
  const { vx, vy } = randStartVelocity(direction);
  return {
    ...ball,
    x,
    y,
    vx,
    vy,
  };
}

function resteerBalls({
  sim,
  vx,
  vy,
  xtranslation,
  ytranslation,
  width,
  height,
}: {
  sim: Sim;
  vx: number;
  vy: number;
  width: number;
  height: number;
  xtranslation: (x: number) => number;
  ytranslation: (y: number) => number;
}): void {
  for (let i = 0; i < sim.free.length; i++) {
    const ball = sim.free[i];
    if (isBallOffscreen(ball, width, height)) {
      ball.x = xtranslation(ball.x);
      ball.y = ytranslation(ball.y);
    }
    ball.vx = vx;
    ball.vy = vy;
  }
}

function makeTranslations(
  width: number,
  height: number,
): Record<
  Direction,
  Record<Direction, { x: (x: number) => number; y: (y: number) => number }>
> {
  return {
    [Direction.LR]: {
      [Direction.LR]: { x: (x) => x, y: (y) => y },
      [Direction.RL]: { x: (x) => x + width * 2, y: (y) => y },
      [Direction.TB]: { x: (x) => width + x, y: (y) => y - height },
      [Direction.BT]: { x: (x) => width + x, y: (y) => y + height },
    },
    [Direction.RL]: {
      [Direction.LR]: { x: (x) => x - width * 2, y: (y) => y },
      [Direction.RL]: { x: (x) => x, y: (y) => y },
      [Direction.TB]: { x: (x) => x - width, y: (y) => y - height },
      [Direction.BT]: { x: (x) => x - width, y: (y) => y + height },
    },
    [Direction.TB]: {
      [Direction.LR]: { x: (x) => x - width, y: (y) => y + height },
      [Direction.RL]: { x: (x) => x + width, y: (y) => y + height },
      [Direction.TB]: { x: (x) => x, y: (y) => y },
      [Direction.BT]: { x: (x) => x, y: (y) => y + height * 2 },
    },
    [Direction.BT]: {
      [Direction.LR]: { x: (x) => x - width, y: (y) => y - height },
      [Direction.RL]: { x: (x) => x + width, y: (y) => y - height },
      [Direction.TB]: { x: (x) => x, y: (y) => y - height * 2 },
      [Direction.BT]: { x: (x) => x, y: (y) => y },
    },
  };
}

export function changeDirection(
  sim: Sim,
  width: number,
  height: number,
  direction: Direction,
  oldDirection: Direction,
): void {
  const translations = makeTranslations(width, height);
  const xtranslation = translations[oldDirection][direction].x;
  const ytranslation = translations[oldDirection][direction].y;
  let vx = 0;
  let vy = 0;
  switch (direction) {
    case Direction.LR:
      vx = CONFIG.ballSpeed;
      break;
    case Direction.RL:
      vx = -CONFIG.ballSpeed;
      break;
    case Direction.TB:
      vy = CONFIG.ballSpeed;
      break;
    case Direction.BT:
      vy = -CONFIG.ballSpeed;
      break;
  }

  resteerBalls({
    sim,
    vx,
    vy,
    xtranslation,
    ytranslation,
    width,
    height,
  });
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
  direction: Direction,
): void {
  const { keepGenerating } = sim;
  for (let i = 0; i < sim.free.length; i++) {
    const ball = sim.free[i];
    if (!keepGenerating) continue;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.appeared && isBallOffscreen(ball, width, height)) {
      sim.free[i] = resetBall(ball, width, height, direction);
    } else if (!ball.appeared) {
      ball.appeared = true;
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
  for (const ball of sim.free) {
    drawBall(ctx, ball);
  }
}

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
  direction: Direction,
  stopRunCallback: () => void,
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

  if (!sim.keepGenerating) return;
  for (let i = 0; i < newlyStuck.length; i++) {
    if (shouldStopGenerating(newlyStuck[i], width, height)) {
      sim.keepGenerating = false;
      sim.free = [];
      stopRunCallback();
      break;
    }

    sim.free.push(
      createBall(width, height, {
        direction,
        stuck: false,
        startPosition: randStartPosition({
          width,
          height,
          direction,
          offset: true,
        }),
      }),
    );
  }
}
