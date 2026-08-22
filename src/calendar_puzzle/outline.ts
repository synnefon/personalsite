import { Point } from "./puzzle.ts";

// Trace the boundary of a set of grid cells and emit an SVG path with
// rounded corners, like the fillets on the laser-cut pieces. Coordinates
// are cell units scaled by `scale`; `radius` is in output units.
export function roundedOutline(cells: Point[], scale: number, radius: number): string {
  const has = new Set(cells.map((p) => `${p.x},${p.y}`));
  const inside = (x: number, y: number) => has.has(`${x},${y}`);

  // Directed boundary edges, clockwise on screen (interior on the right
  // with y pointing down). Keyed by start vertex; these piece shapes
  // never pinch, so one outgoing edge per vertex.
  const next = new Map<string, Point>();
  const addEdge = (from: Point, to: Point) => next.set(`${from.x},${from.y}`, to);
  for (const { x, y } of cells) {
    if (!inside(x, y - 1)) addEdge({ x, y }, { x: x + 1, y });
    if (!inside(x + 1, y)) addEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (!inside(x, y + 1)) addEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    if (!inside(x - 1, y)) addEdge({ x, y: y + 1 }, { x, y });
  }

  // Walk the loop, keeping only corner vertices
  const startKey = next.keys().next().value as string;
  const [sx, sy] = startKey.split(",").map(Number);
  const corners: Point[] = [];
  let prev: Point = { x: sx, y: sy };
  let cur = next.get(startKey) as Point;
  let guard = next.size + 1;
  while (guard-- > 0) {
    const following = next.get(`${cur.x},${cur.y}`) as Point;
    const straight =
      (prev.x === cur.x && cur.x === following.x) || (prev.y === cur.y && cur.y === following.y);
    if (!straight) corners.push(cur);
    prev = cur;
    cur = following;
    if (cur.x === sx && cur.y === sy && corners.length > 0) {
      const following2 = next.get(startKey) as Point;
      const straight2 =
        (prev.x === cur.x && cur.x === following2.x) ||
        (prev.y === cur.y && cur.y === following2.y);
      if (!straight2) corners.push(cur);
      break;
    }
  }

  // Round each corner: approach along the incoming edge, then a
  // quadratic curve through the corner onto the outgoing edge
  const parts: string[] = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const c = corners[i];
    const before = corners[(i + n - 1) % n];
    const after = corners[(i + 1) % n];
    const inDir = { x: Math.sign(c.x - before.x), y: Math.sign(c.y - before.y) };
    const outDir = { x: Math.sign(after.x - c.x), y: Math.sign(after.y - c.y) };
    const cx = c.x * scale;
    const cy = c.y * scale;
    const entry = { x: cx - inDir.x * radius, y: cy - inDir.y * radius };
    const exit = { x: cx + outDir.x * radius, y: cy + outDir.y * radius };
    parts.push(
      `${i === 0 ? `M ${entry.x} ${entry.y}` : `L ${entry.x} ${entry.y}`} Q ${cx} ${cy} ${exit.x} ${exit.y}`
    );
  }
  parts.push("Z");
  return parts.join(" ");
}
