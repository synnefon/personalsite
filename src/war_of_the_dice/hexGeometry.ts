import { HEX_SIZE } from "./constants.ts";
import type { HexCoord } from "./types.ts";

const SQRT3 = Math.sqrt(3);

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

// Pointy-top axial → pixel (centroid).
export function hexToPixel(
  coord: HexCoord,
  size: number = HEX_SIZE
): { x: number; y: number } {
  return {
    x: size * SQRT3 * (coord.q + coord.r / 2),
    y: size * 1.5 * coord.r,
  };
}

// Edge index → axial offset of the neighbor on the other side of that edge.
// Edge i runs from vertex i to vertex (i+1)%6. With our vertex angles
// (30°,90°,…) and SVG's y-axis pointing down, edge 0 is the SE edge, edge 1
// the SW edge, and so on counter-clockwise around the hex.
const EDGE_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // 0: SE — edge v0 (lower-right) → v1 (bottom)
  [-1, 1], // 1: SW — edge v1 (bottom) → v2 (lower-left)
  [-1, 0], // 2: W — edge v2 (lower-left) → v3 (upper-left)
  [0, -1], // 3: NW — edge v3 (upper-left) → v4 (top)
  [1, -1], // 4: NE — edge v4 (top) → v5 (upper-right)
  [1, 0], // 5: E — edge v5 (upper-right) → v0 (lower-right)
];

export function hexNeighborByEdge(coord: HexCoord, edgeIdx: number): HexCoord {
  const [dq, dr] = EDGE_NEIGHBOR_OFFSETS[edgeIdx];
  return { q: coord.q + dq, r: coord.r + dr };
}

export function hexAllNeighbors(coord: HexCoord): HexCoord[] {
  return EDGE_NEIGHBOR_OFFSETS.map(([dq, dr]) => ({
    q: coord.q + dq,
    r: coord.r + dr,
  }));
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Hex-relative vertex key: identifies a vertex by the three hex cells that
// meet at it, sorted canonically. Bulletproof against floating-point — two
// adjacent hexes that share a vertex always produce the same key.
export function hexVertexKey(h: HexCoord, vertexIdx: number): string {
  const aOff = EDGE_NEIGHBOR_OFFSETS[(vertexIdx + 5) % 6];
  const bOff = EDGE_NEIGHBOR_OFFSETS[vertexIdx % 6];
  const trio: Array<[number, number]> = [
    [h.q, h.r],
    [h.q + aOff[0], h.r + aOff[1]],
    [h.q + bOff[0], h.r + bOff[1]],
  ];
  trio.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  return `${trio[0][0]},${trio[0][1]}|${trio[1][0]},${trio[1][1]}|${trio[2][0]},${trio[2][1]}`;
}

// Edge i runs from vertex i to vertex (i + 1) mod 6.
export function hexEdgeVertexKeys(
  h: HexCoord,
  edgeIdx: number
): [string, string] {
  return [hexVertexKey(h, edgeIdx), hexVertexKey(h, (edgeIdx + 1) % 6)];
}

function vertex(
  cx: number,
  cy: number,
  i: number,
  size: number
): { x: number; y: number } {
  const angleRad = (Math.PI / 180) * (30 + 60 * i);
  return {
    x: cx + size * Math.cos(angleRad),
    y: cy + size * Math.sin(angleRad),
  };
}

export function hexPolygonPoints(
  cx: number,
  cy: number,
  size: number = HEX_SIZE
): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const v = vertex(cx, cy, i, size);
    pts.push(`${v.x.toFixed(2)},${v.y.toFixed(2)}`);
  }
  return pts.join(" ");
}

export function hexEdgeEndpoints(
  cx: number,
  cy: number,
  edgeIdx: number,
  size: number = HEX_SIZE
): { x1: number; y1: number; x2: number; y2: number } {
  const a = vertex(cx, cy, edgeIdx, size);
  const b = vertex(cx, cy, (edgeIdx + 1) % 6, size);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}
