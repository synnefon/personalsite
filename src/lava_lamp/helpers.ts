/**
 * Helper utilities for the Lava Lamp simulation
 */

import { MUSIC_TIME_KEY, SPEED, type SpatialGrid } from "./config.ts";

// ============================================================================
// LocalStorage utilities
// ============================================================================

export function readSavedMusicTimeSeconds(): number {
  try {
    const raw = localStorage.getItem(MUSIC_TIME_KEY);
    if (!raw) return 0;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function writeSavedMusicTimeSeconds(seconds: number): void {
  try {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    localStorage.setItem(MUSIC_TIME_KEY, String(seconds));
  } catch {}
}

// ============================================================================
// Speed control utilities
// ============================================================================

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

  const t = idx / steps;
  const targetMidSpeed = 0.5;
  const minPositive = (targetMidSpeed * targetMidSpeed) / SPEED.MAX;

  const minLog = Math.log(minPositive);
  const maxLog = Math.log(SPEED.MAX);

  // lerp inline to avoid circular dependency
  return Math.exp(minLog + (maxLog - minLog) * t);
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

// ============================================================================
// Spatial grid utilities
// ============================================================================

/**
 * Ensures the spatial grid is initialized to match the given parameters
 */
export function ensureGrid(
  gridRef: React.MutableRefObject<SpatialGrid | null>,
  width: number,
  height: number,
  count: number,
  cellSize: number
): void {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const cells = cols * rows;

  const g = gridRef.current;
  if (
    !g ||
    g.cols !== cols ||
    g.rows !== rows ||
    g.cellSize !== cellSize ||
    g.next.length !== count ||
    g.heads.length !== cells
  ) {
    gridRef.current = {
      cellSize,
      cols,
      rows,
      heads: new Int32Array(cells),
      next: new Int32Array(count),
    };
  }
}

/**
 * Get the grid index from cell coordinates
 */
export function gridIndex(g: SpatialGrid, cx: number, cy: number): number {
  return cy * g.cols + cx;
}
