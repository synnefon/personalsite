import {
  COLS,
  DotMode,
  NUM_CELLS,
  Orientation,
  PIECES,
  Point,
  ROWS,
  orientationsFor,
} from "./puzzle.ts";

export interface Placement {
  pieceIdx: number;
  // absolute board cells covered by the piece
  cells: Point[];
  // absolute dot position in cell units, or null when the dot faces down
  dot: Point | null;
}

export interface Solution {
  placements: Placement[];
  nodes: number;
  ms: number;
}

// The 50-cell board lives in two 32-bit words: lo = cells 0..31,
// hi = cells 32..49 (bitwise ops in JS are 32-bit only).
interface CandidatePlacement {
  pieceIdx: number;
  ori: Orientation;
  ox: number;
  oy: number;
  lo: number;
  hi: number;
}

interface PlacementTable {
  // candidate placements covering each cell index
  coverByCell: CandidatePlacement[][];
}

function buildTable(mode: DotMode): PlacementTable {
  const coverByCell: CandidatePlacement[][] = Array.from({ length: NUM_CELLS }, () => []);
  PIECES.forEach((piece, pieceIdx) => {
    for (const ori of orientationsFor(piece, mode)) {
      for (let oy = 0; oy + ori.h <= ROWS; oy++) {
        for (let ox = 0; ox + ori.w <= COLS; ox++) {
          let lo = 0;
          let hi = 0;
          for (const p of ori.cells) {
            const idx = (p.y + oy) * COLS + (p.x + ox);
            if (idx < 32) lo |= 1 << idx;
            else hi |= 1 << (idx - 32);
          }
          const cand: CandidatePlacement = { pieceIdx, ori, ox, oy, lo, hi };
          for (const p of ori.cells) {
            coverByCell[(p.y + oy) * COLS + (p.x + ox)].push(cand);
          }
        }
      }
    }
  });
  return { coverByCell };
}

const TABLES: Map<DotMode, PlacementTable> = new Map();
function tableFor(mode: DotMode): PlacementTable {
  let table = TABLES.get(mode);
  if (!table) {
    table = buildTable(mode);
    TABLES.set(mode, table);
  }
  return table;
}

// mulberry32: tiny seeded PRNG so "shuffle" can walk to a different
// arrangement deterministically per seed
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const FULL_LO = -1; // bits 0..31
const FULL_HI = (1 << (NUM_CELLS - 32)) - 1; // bits 32..49

// tetromino count among PIECES (the rest are pentominoes)
const NUM_TETS = PIECES.filter((p) => p.shape.join("").split("X").length - 1 === 4).length;
const NUM_PENTS = PIECES.length - NUM_TETS;
const TET_MASK = PIECES.reduce(
  (mask, p, i) => (p.shape.join("").split("X").length - 1 === 4 ? mask | (1 << i) : mask),
  0
);

function popcount(word: number): number {
  let v = word - ((word >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  return (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

// can some sub-multiset of `tets` 4s and `pents` 5s sum to `size`?
function regionFillable(size: number, tets: number, pents: number): boolean {
  for (let b = 0; b <= pents; b++) {
    const rest = size - 5 * b;
    if (rest < 0) break;
    if (rest % 4 === 0 && rest / 4 <= tets) return true;
  }
  return false;
}

// Every connected empty region must be fillable by the remaining pieces,
// or this branch is dead. Sound but not exhaustive (regions share the
// remaining pieces); still kills almost all hopeless branches early.
const regionStack = new Uint8Array(NUM_CELLS);
const regionSeen = new Uint8Array(NUM_CELLS);
function regionsFillable(lo: number, hi: number, used: number): boolean {
  const tets = NUM_TETS - popcount(used & TET_MASK);
  const pents = NUM_PENTS - popcount(used & ~TET_MASK);
  regionSeen.fill(0);
  const filled = (idx: number) =>
    idx < 32 ? (lo & (1 << idx)) !== 0 : (hi & (1 << (idx - 32))) !== 0;
  for (let start = 0; start < NUM_CELLS; start++) {
    if (regionSeen[start] || filled(start)) continue;
    let size = 0;
    let top = 0;
    regionStack[top++] = start;
    regionSeen[start] = 1;
    while (top > 0) {
      const idx = regionStack[--top];
      size++;
      const x = idx % COLS;
      if (x > 0 && !regionSeen[idx - 1] && !filled(idx - 1)) {
        regionSeen[idx - 1] = 1;
        regionStack[top++] = idx - 1;
      }
      if (x < COLS - 1 && !regionSeen[idx + 1] && !filled(idx + 1)) {
        regionSeen[idx + 1] = 1;
        regionStack[top++] = idx + 1;
      }
      if (idx >= COLS && !regionSeen[idx - COLS] && !filled(idx - COLS)) {
        regionSeen[idx - COLS] = 1;
        regionStack[top++] = idx - COLS;
      }
      if (idx < NUM_CELLS - COLS && !regionSeen[idx + COLS] && !filled(idx + COLS)) {
        regionSeen[idx + COLS] = 1;
        regionStack[top++] = idx + COLS;
      }
    }
    if (!regionFillable(size, tets, pents)) return false;
  }
  return true;
}

// Fill every cell except the blocked ones with the 10 pieces: repeatedly
// pick the most constrained empty cell and try every placement covering it.
export function solve(blockedCells: number[], mode: DotMode, seed: number): Solution | null {
  const start = performance.now();
  const { coverByCell } = tableFor(mode);
  const rand = mulberry32(seed);
  const cover = coverByCell.map((cands) => shuffled(cands, rand));

  let blockedLo = 0;
  let blockedHi = 0;
  for (const idx of blockedCells) {
    if (idx < 32) blockedLo |= 1 << idx;
    else blockedHi |= 1 << (idx - 32);
  }

  const chosen: CandidatePlacement[] = [];
  let nodes = 0;

  // most-constrained-cell: the empty cell with the fewest placements that
  // still fit. Collapses the search tree; a 0-count cell fails the branch
  // immediately and a 1-count cell is forced.
  const pickCell = (lo: number, hi: number, used: number): number => {
    let bestCell = -1;
    let bestCount = Infinity;
    for (let word = 0; word < 2; word++) {
      let empty = word === 0 ? ~lo : ~hi & FULL_HI;
      while (empty !== 0) {
        const bit = empty & -empty;
        empty ^= bit;
        const cellIdx = word * 32 + (31 - Math.clz32(bit));
        let count = 0;
        for (const cand of cover[cellIdx]) {
          if (used & (1 << cand.pieceIdx)) continue;
          if (cand.lo & lo || cand.hi & hi) continue;
          count++;
          if (count >= bestCount) break;
        }
        if (count < bestCount) {
          bestCount = count;
          bestCell = cellIdx;
          if (count <= 1) return bestCell;
        }
      }
    }
    return bestCell;
  };

  const backtrack = (lo: number, hi: number, used: number): boolean => {
    nodes++;
    if (lo === FULL_LO && hi === FULL_HI) return true;
    const cellIdx = pickCell(lo, hi, used);
    for (const cand of cover[cellIdx]) {
      if (used & (1 << cand.pieceIdx)) continue;
      if (cand.lo & lo || cand.hi & hi) continue;
      const nextLo = lo | cand.lo;
      const nextHi = hi | cand.hi;
      const nextUsed = used | (1 << cand.pieceIdx);
      if (!regionsFillable(nextLo, nextHi, nextUsed)) continue;
      chosen.push(cand);
      if (backtrack(nextLo, nextHi, nextUsed)) return true;
      chosen.pop();
    }
    return false;
  };

  const found = backtrack(blockedLo, blockedHi, 0);
  const ms = performance.now() - start;
  if (!found) return null;

  const placements: Placement[] = chosen.map((cand) => ({
    pieceIdx: cand.pieceIdx,
    cells: cand.ori.cells.map((p) => ({ x: p.x + cand.ox, y: p.y + cand.oy })),
    dot: cand.ori.dot ? { x: cand.ori.dot.x + cand.ox, y: cand.ori.dot.y + cand.oy } : null,
  }));
  placements.sort((a, b) => a.pieceIdx - b.pieceIdx);
  return { placements, nodes, ms };
}
