import { CONFIG, Direction } from "./config.ts";
import { Ball, Sim } from "./types.ts";

// Grid keys pack (cx, cy) into one number. Ball coordinates stay within the
// canvas, so cx and cy are non-negative and cy stays well below the stride.
const GRID_STRIDE = 100000;

/** Random float in [min, max). */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Free-ball speed scales inversely with radius: default radius → CONFIG.ballSpeed. */
function speedForRadius(radius: number): number {
  return (CONFIG.ballSpeed * CONFIG.ballRadius) / radius;
}

function randStartVelocity(
  direction: Direction,
  speed: number,
): { vx: number; vy: number } {
  switch (direction) {
    case Direction.LR:
      return { vx: speed, vy: 0 };
    case Direction.RL:
      return { vx: -speed, vy: 0 };
    case Direction.TB:
      return { vx: 0, vy: speed };
    case Direction.BT:
      return { vx: 0, vy: -speed };
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
  const { vx, vy } = randStartVelocity(direction, speedForRadius(r));
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

  if (cell) {
    cell.push(ball);
  } else {
    sim.grid.set(key, [ball]);
  }

  if (ball.x < sim.minX) sim.minX = ball.x;
  if (ball.x > sim.maxX) sim.maxX = ball.x;
  if (ball.y < sim.minY) sim.minY = ball.y;
  if (ball.y > sim.maxY) sim.maxY = ball.y;
  drawBall(sim.clusterCtx, ball);
}

/** True if `ball` overlaps any stuck ball, found via the spatial grid. */
export function touchesCluster(sim: Sim, ball: Ball): boolean {
  // Cheap reject: a ball outside the cluster's bounding box (padded by one
  // cell, which is >= any radius sum) can't touch a stuck ball, so skip the
  // nine grid probes entirely.
  const pad = sim.cellSize;
  if (
    ball.x < sim.minX - pad ||
    ball.x > sim.maxX + pad ||
    ball.y < sim.minY - pad ||
    ball.y > sim.maxY + pad
  ) {
    return false;
  }
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
    cellSize: 2 * Math.max(maxRadius, CONFIG.maxBallRadius),
    cluster,
    clusterCtx,
    keepGenerating: true,
    freeRadius: CONFIG.ballRadius,
    source: balls[0],
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
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

/** Set free balls' radius and inversely-scaled speed — current and future. Stuck balls keep theirs. */
export function setFreeRadius(sim: Sim, radius: number): void {
  sim.freeRadius = radius;
  const speed = speedForRadius(radius);
  for (const ball of sim.free) {
    ball.radius = radius;
    const mag = Math.hypot(ball.vx, ball.vy);
    if (mag > 0) {
      ball.vx = (ball.vx / mag) * speed;
      ball.vy = (ball.vy / mag) * speed;
    }
  }
}

/**
 * Reposition the source ball (drag-and-drop): re-bucket it in the grid, then
 * repaint the cluster bitmap and recompute its bounds. Only the source moves.
 */
export function moveSource(sim: Sim, x: number, y: number): void {
  const src = sim.source;
  const oldKey =
    Math.floor(src.x / sim.cellSize) * GRID_STRIDE +
    Math.floor(src.y / sim.cellSize);
  const oldCell = sim.grid.get(oldKey);
  if (oldCell) {
    const idx = oldCell.indexOf(src);
    if (idx >= 0) oldCell.splice(idx, 1);
    if (oldCell.length === 0) sim.grid.delete(oldKey);
  }
  src.x = x;
  src.y = y;
  const newKey =
    Math.floor(x / sim.cellSize) * GRID_STRIDE + Math.floor(y / sim.cellSize);
  const newCell = sim.grid.get(newKey);
  if (newCell) newCell.push(src);
  else sim.grid.set(newKey, [src]);

  // Repaint the cached cluster bitmap and recompute its bounds from scratch.
  const ctx = sim.clusterCtx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, sim.cluster.width, sim.cluster.height);
  ctx.restore();
  sim.minX = Infinity;
  sim.minY = Infinity;
  sim.maxX = -Infinity;
  sim.maxY = -Infinity;
  for (const cell of sim.grid.values()) {
    for (const ball of cell) {
      drawBall(ctx, ball);
      if (ball.x < sim.minX) sim.minX = ball.x;
      if (ball.x > sim.maxX) sim.maxX = ball.x;
      if (ball.y < sim.minY) sim.minY = ball.y;
      if (ball.y > sim.maxY) sim.maxY = ball.y;
    }
  }
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
): void {
  const { x, y } = randStartPosition({
    width,
    height,
    direction,
    offset: false,
  });
  const { vx, vy } = randStartVelocity(direction, speedForRadius(ball.radius));
  ball.x = x;
  ball.y = y;
  ball.vx = vx;
  ball.vy = vy;
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
  const speed = speedForRadius(sim.freeRadius);
  let vx = 0;
  let vy = 0;
  switch (direction) {
    case Direction.LR:
      vx = speed;
      break;
    case Direction.RL:
      vx = -speed;
      break;
    case Direction.TB:
      vy = speed;
      break;
    case Direction.BT:
      vy = -speed;
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
  if (!sim.keepGenerating) return;
  const free = sim.free;
  if (free.length === 0) return;

  // Every free ball shares the current direction's velocity, so the per-frame
  // displacement is identical for all of them — compute it once.
  const dx = free[0].vx * dt;
  const dy = free[0].vy * dt;

  for (let i = 0; i < free.length; i++) {
    const ball = free[i];
    ball.x += dx;
    ball.y += dy;

    if (ball.appeared && isBallOffscreen(ball, width, height)) {
      resetBall(ball, width, height, direction);
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

  // Free balls share one radius and color, so submit them as a single path and
  // fill once instead of a beginPath/fill round-trip per ball.
  const free = sim.free;
  if (free.length === 0) return;
  ctx.fillStyle = CONFIG.freeColor;
  ctx.beginPath();
  const TAU = Math.PI * 2;
  for (let i = 0; i < free.length; i++) {
    const b = free[i];
    ctx.moveTo(b.x + b.radius, b.y); // lift the pen so arcs don't link up
    ctx.arc(b.x, b.y, b.radius, 0, TAU);
  }
  ctx.fill();
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
  onConnections?: (count: number) => void,
): void {
  const free = sim.free;
  const stuckIdx: number[] = [];
  for (let i = 0; i < free.length; i++) {
    const ball = free[i];
    if (touchesCluster(sim, ball)) {
      ball.stuck = true;
      ball.color = CONFIG.stuckColor;
      stuckIdx.push(i);
    }
  }
  if (stuckIdx.length === 0) return;
  onConnections?.(stuckIdx.length);

  // Commit after the scan: every ball this frame is tested against the same
  // cluster snapshot, and the grid is never mutated while it's being read.
  for (let k = 0; k < stuckIdx.length; k++) addStuck(sim, free[stuckIdx[k]]);

  if (!sim.keepGenerating) {
    sim.free = free.filter((ball) => !ball.stuck);
    return;
  }

  // Each stuck ball is replaced by exactly one fresh free ball, so reuse its
  // slot instead of filtering the array and re-growing it every frame.
  for (let k = 0; k < stuckIdx.length; k++) {
    const i = stuckIdx[k];
    if (shouldStopGenerating(free[i], width, height)) {
      sim.keepGenerating = false;
      sim.free = [];
      stopRunCallback();
      return;
    }

    free[i] = createBall(width, height, {
      direction,
      stuck: false,
      radius: sim.freeRadius,
      startPosition: randStartPosition({
        width,
        height,
        direction,
        offset: true,
      }),
    });
  }
}

/**
 * Advance the sim one frame, sub-stepping so no free ball moves more than its
 * own radius between collision checks. Without this, fast (small) balls leap
 * over the cluster's thin capture zone between frames and tunnel through,
 * collapsing the growth into straight lines.
 */
export function advanceSim(
  sim: Sim,
  width: number,
  height: number,
  dt: number,
  direction: Direction,
  stopRunCallback: () => void,
  onConnections?: (count: number) => void,
): void {
  const distance = speedForRadius(sim.freeRadius) * dt;
  const substeps = Math.max(1, Math.ceil(distance / sim.freeRadius));
  const subDt = dt / substeps;
  for (let s = 0; s < substeps; s++) {
    stepSim(sim, width, height, subDt, direction);
    applyInteractions(sim, width, height, direction, stopRunCallback, onConnections);
    if (!sim.keepGenerating) break;
  }
}
