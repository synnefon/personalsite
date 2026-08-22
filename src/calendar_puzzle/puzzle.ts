// Puzzle spec for the wooden "Calendar Puzzle" (CSMDD10501) designed by
// PolyPuzzleLab (https://polypuzzlelab.blogspot.com/), reverse-engineered
// from their laser-cut files: a 10x5 board of 50 labeled cells covered
// by 10 polyomino pieces (47 cells), leaving 3 windows that show the
// month, day of week, and date. Each piece has one dot engraved on one
// face; the dot challenges constrain which side may face up.

export const COLS = 10;
export const ROWS = 5;
export const NUM_CELLS = COLS * ROWS;

// Board labels, row-major, exactly as engraved on the physical board.
export const LABELS: string[][] = [
  ["Jan", "Feb", "Mar", "Apr", "1", "2", "3", "4", "5", "6"],
  ["May", "Jun", "Jul", "Aug", "7", "8", "9", "10", "11", "12"],
  ["Sep", "Oct", "Nov", "Dec", "13", "14", "15", "16", "17", "18"],
  ["Mon", "Tue", "Wed", "Thur", "19", "20", "21", "22", "23", "24"],
  ["Fri", "Sat", "Sun", "25", "26", "27", "28", "29", "30", "31"],
];

// JS Date.getMonth() order
export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// JS Date.getDay() order; the board engraves Thursday as "Thur"
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thur", "Fri", "Sat"];

const CELL_OF_LABEL: Map<string, number> = new Map(
  LABELS.flatMap((row, r) => row.map((label, c) => [label, r * COLS + c] as [string, number]))
);

export function cellOf(label: string): number {
  const cell = CELL_OF_LABEL.get(label);
  if (cell === undefined) throw new Error(`no board cell labeled "${label}"`);
  return cell;
}

export type DotMode = "ignore" | "all" | "none";

export interface Point {
  x: number;
  y: number;
}

export interface PieceSpec {
  // pentomino/tetromino naming for the dot-side-up shape
  name: string;
  // rows of '.'/'X', the shape with its dotted face up
  shape: string[];
  // engraved dot position in cell units, relative to the shape's origin
  // (0.5, 0.5 would be the center of the top-left cell)
  dot: Point;
  color: string;
}

// Shapes and dot positions come from the engraving layout in the cut file,
// so "as written" here means dot-face-up.
export const PIECES: PieceSpec[] = [
  { name: "V", shape: ["XXX", "..X", "..X"], dot: { x: 2.5, y: 0.5 }, color: "#e56b6f" },
  { name: "F", shape: ["X..", "XXX", ".X."], dot: { x: 1.5, y: 1.5 }, color: "#f4a261" },
  { name: "L", shape: ["XX", "X.", "X.", "X."], dot: { x: 0.5, y: 0.5 }, color: "#e9c46a" },
  { name: "U", shape: ["XXX", "X.X"], dot: { x: 1.5, y: 0.5 }, color: "#8ab17d" },
  { name: "N", shape: [".X", "XX", "X.", "X."], dot: { x: 1.0, y: 1.5 }, color: "#2a9d8f" },
  { name: "S", shape: [".X", "XX", "X."], dot: { x: 1.0, y: 1.5 }, color: "#457b9d" },
  { name: "J", shape: [".X", ".X", "XX"], dot: { x: 1.5, y: 2.5 }, color: "#6d597a" },
  { name: "Y", shape: ["XXXX", "..X."], dot: { x: 2.5, y: 0.5 }, color: "#b56576" },
  { name: "P", shape: [".XX", "XXX"], dot: { x: 2.0, y: 1.0 }, color: "#a44a3f" },
  { name: "T", shape: [".X.", "XXX"], dot: { x: 1.5, y: 1.0 }, color: "#7f9c6c" },
];

export interface Orientation {
  cells: Point[]; // sorted row-major, normalized to origin
  w: number;
  h: number;
  // null when this orientation puts the dotted face down (mirrored shape)
  dot: Point | null;
}

interface RawOrientation {
  cells: Point[];
  dot: Point;
  mirrored: boolean;
}

function shapeCells(shape: string[]): Point[] {
  const cells: Point[] = [];
  shape.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "X") cells.push({ x, y });
    });
  });
  return cells;
}

function bounds(cells: Point[]): { w: number; h: number } {
  return {
    w: Math.max(...cells.map((p) => p.x)) + 1,
    h: Math.max(...cells.map((p) => p.y)) + 1,
  };
}

// 90° clockwise; works for both integer cell coords and fractional dot
// coords (cell (x,y) spans x..x+1, so the shape occupies 0..w, 0..h)
function rotate(o: RawOrientation): RawOrientation {
  const { h } = bounds(o.cells);
  return {
    cells: o.cells.map((p) => ({ x: h - 1 - p.y, y: p.x })),
    dot: { x: h - o.dot.y, y: o.dot.x },
    mirrored: o.mirrored,
  };
}

function mirror(o: RawOrientation): RawOrientation {
  const { w } = bounds(o.cells);
  return {
    cells: o.cells.map((p) => ({ x: w - 1 - p.x, y: p.y })),
    dot: { x: w - o.dot.x, y: o.dot.y },
    mirrored: !o.mirrored,
  };
}

function cellsKey(cells: Point[]): string {
  return cells
    .map((p) => `${p.x},${p.y}`)
    .sort()
    .join(";");
}

// Unique orientations of a piece under the given dot mode:
//   all    -> dot face up: rotations only
//   none   -> dot face down: rotations of the mirrored shape
//   ignore -> both faces allowed
// Rotations are listed before mirrors, so when a piece is achiral (its
// mirror equals one of its rotations) dedup keeps the dot-up version and
// the display still gets a dot — matching the physical piece, which can
// always be placed dot-up in that spot.
export function orientationsFor(piece: PieceSpec, mode: DotMode): Orientation[] {
  const base: RawOrientation = {
    cells: shapeCells(piece.shape),
    dot: piece.dot,
    mirrored: false,
  };
  const rotations: RawOrientation[] = [base];
  for (let i = 0; i < 3; i++) rotations.push(rotate(rotations[i]));
  const mirrors = rotations.map(mirror);

  const candidates =
    mode === "all" ? rotations : mode === "none" ? mirrors : [...rotations, ...mirrors];

  const seen = new Set<string>();
  const result: Orientation[] = [];
  for (const cand of candidates) {
    const key = cellsKey(cand.cells);
    if (seen.has(key)) continue;
    seen.add(key);
    const { w, h } = bounds(cand.cells);
    const cells = [...cand.cells].sort((a, b) => a.y - b.y || a.x - b.x);
    result.push({ cells, w, h, dot: cand.mirrored ? null : cand.dot });
  }
  return result;
}
