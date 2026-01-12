export type SpatialGrid = {
  cellSize: number;
  cols: number;
  rows: number;
  heads: Int32Array; // length cols*rows, head index or -1
  next: Int32Array;  // length particleCount, next index or -1
};

export function ensureGrid(gridRef: React.MutableRefObject<SpatialGrid | null>, width: number, height: number, count: number, cellSize: number) {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const cells = cols * rows;

  const g = gridRef.current;
  if (!g || g.cols !== cols || g.rows !== rows || g.cellSize !== cellSize || g.next.length !== count) {
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