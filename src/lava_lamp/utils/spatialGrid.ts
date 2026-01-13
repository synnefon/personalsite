/**
 * Spatial grid utilities for efficient neighbor queries
 */

import type { SpatialGrid } from "./types.ts";
import type React from "react";

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

export function gridIndex(g: SpatialGrid, cx: number, cy: number): number {
  return cy * g.cols + cx;
}
