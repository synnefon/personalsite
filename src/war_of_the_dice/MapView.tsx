import React, { useMemo, type ReactElement } from "react";
import { BORDER_COLOR, HEX_SIZE, PLAYER_COLORS } from "./constants.ts";
import {
  hexEdgeEndpoints,
  hexEdgeVertexKeys,
  hexKey,
  hexNeighborByEdge,
  hexPolygonPoints,
  hexToPixel,
} from "./hexGeometry.ts";
import type { GameMap, Hex } from "./types.ts";

const SELECTION_STROKE = "#f8f8ff";
const SELECTION_STROKE_WIDTH = 4;
const BORDER_STROKE_WIDTH = 2.5;

type Point = { x: number; y: number };

type Props = {
  map: GameMap;
  highlightedTerritoryIds: ReadonlyArray<number>;
  onTerritoryClick: (territoryId: number) => void;
  onBackgroundClick: () => void;
};

// Trace the outline of a territory as a list of closed loops. Each loop is
// an ordered list of vertex pixel coords. One outer loop, plus one inner
// loop per fully-enclosed lake. Uses hex-relative vertex keys for matching
// (no floating-point comparisons), so adjacent hexes always agree on which
// vertex they share.
function traceTerritoryPerimeter(
  territoryHexes: ReadonlyArray<Hex>,
  hexes: Map<string, Hex>,
  positions: Map<string, Point>
): Point[][] {
  type BEdge = { fromKey: string; toKey: string; from: Point; to: Point };
  const edges: BEdge[] = [];

  for (const h of territoryHexes) {
    const p = positions.get(hexKey(h.q, h.r));
    if (!p) continue;
    for (let i = 0; i < 6; i++) {
      const nCoord = hexNeighborByEdge(h, i);
      const nHex = hexes.get(hexKey(nCoord.q, nCoord.r));
      if (nHex && nHex.territoryId === h.territoryId) continue;
      const e = hexEdgeEndpoints(p.x, p.y, i);
      const [kFrom, kTo] = hexEdgeVertexKeys(h, i);
      edges.push({
        fromKey: kFrom,
        toKey: kTo,
        from: { x: e.x1, y: e.y1 },
        to: { x: e.x2, y: e.y2 },
      });
    }
  }

  const adj = new Map<string, BEdge[]>();
  for (const edge of edges) {
    let a = adj.get(edge.fromKey);
    if (!a) {
      a = [];
      adj.set(edge.fromKey, a);
    }
    a.push(edge);
    let b = adj.get(edge.toKey);
    if (!b) {
      b = [];
      adj.set(edge.toKey, b);
    }
    b.push(edge);
  }

  const used = new Set<BEdge>();
  const loops: Point[][] = [];

  for (const seed of edges) {
    if (used.has(seed)) continue;
    used.add(seed);
    const startKey = seed.fromKey;
    let currentKey = seed.toKey;
    const loop: Point[] = [seed.from, seed.to];

    while (currentKey !== startKey) {
      const candidates = adj.get(currentKey) ?? [];
      let nextEdge: BEdge | null = null;
      for (const e of candidates) {
        if (used.has(e)) continue;
        nextEdge = e;
        break;
      }
      if (!nextEdge) break;
      used.add(nextEdge);
      const goingFromTo = nextEdge.fromKey === currentKey;
      const otherKey = goingFromTo ? nextEdge.toKey : nextEdge.fromKey;
      const otherPt = goingFromTo ? nextEdge.to : nextEdge.from;
      currentKey = otherKey;
      if (currentKey !== startKey) loop.push(otherPt);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Place the dice label at the hex whose center is closest to the territory's
// centroid. Using a real hex center (not the raw average) keeps the label
// inside the territory even for L-shaped or concave blobs.
function pickLabelPosition(
  territoryHexes: ReadonlyArray<Hex>,
  positions: Map<string, Point>
): Point {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const h of territoryHexes) {
    const p = positions.get(hexKey(h.q, h.r));
    if (!p) continue;
    sx += p.x;
    sy += p.y;
    count++;
  }
  if (count === 0) return { x: 0, y: 0 };
  const cx = sx / count;
  const cy = sy / count;
  let best: Point = { x: cx, y: cy };
  let bestDist = Infinity;
  for (const h of territoryHexes) {
    const p = positions.get(hexKey(h.q, h.r));
    if (!p) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function pathDFromLoops(loops: ReadonlyArray<ReadonlyArray<Point>>): string {
  return loops
    .map((loop) => {
      const cmds: string[] = loop.map((p, i) =>
        i === 0
          ? `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
          : `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
      );
      cmds.push("Z");
      return cmds.join(" ");
    })
    .join(" ");
}

export default function MapView({
  map,
  highlightedTerritoryIds,
  onTerritoryClick,
  onBackgroundClick,
}: Props): ReactElement {
  const { hexes, territories } = map;

  const { positions, viewBox } = useMemo(() => {
    const positions = new Map<string, Point>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [k, h] of hexes) {
      const p = hexToPixel(h);
      positions.set(k, p);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = HEX_SIZE + 4;
    const w = maxX - minX + 2 * pad;
    const h = maxY - minY + 2 * pad;
    return {
      positions,
      viewBox: `${minX - pad} ${minY - pad} ${w} ${h}`,
    };
  }, [hexes]);

  const renders = useMemo(() => {
    const hexesByTerritory: Hex[][] = territories.map(() => []);
    for (const h of hexes.values()) {
      hexesByTerritory[h.territoryId].push(h);
    }
    return territories.map((territory) => {
      const color = PLAYER_COLORS[territory.ownerId];
      const tHexes = hexesByTerritory[territory.id];
      const loops = traceTerritoryPerimeter(tHexes, hexes, positions);
      const label = pickLabelPosition(tHexes, positions);
      return {
        territoryId: territory.id,
        color,
        hexes: tHexes,
        pathD: pathDFromLoops(loops),
        label,
        dice: territory.dice,
      };
    });
  }, [territories, hexes, positions]);

  const highlightRenders = highlightedTerritoryIds
    .map((id) => renders[id])
    .filter((r): r is (typeof renders)[number] => r !== undefined);

  return (
    <svg
      className="wotd-map"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      onClick={onBackgroundClick}
    >
      {renders.map(
        ({ territoryId, color, hexes: tHexes, pathD, label, dice }) => (
          <g
            key={territoryId}
            className="wotd-territory"
            onClick={(e) => {
              e.stopPropagation();
              onTerritoryClick(territoryId);
            }}
          >
            {tHexes.map((h) => {
              const k = hexKey(h.q, h.r);
              const p = positions.get(k);
              if (!p) return null;
              return (
                <polygon
                  key={k}
                  points={hexPolygonPoints(p.x, p.y)}
                  fill={color}
                  stroke={color}
                  strokeWidth={0.5}
                />
              );
            })}
            <path
              d={pathD}
              fill="none"
              stroke={BORDER_COLOR}
              strokeWidth={BORDER_STROKE_WIDTH}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={HEX_SIZE * 0.95}
              fontWeight={700}
              fill="#ffffff"
              stroke={BORDER_COLOR}
              strokeWidth={2}
              paintOrder="stroke fill"
              pointerEvents="none"
            >
              {dice}
            </text>
          </g>
        )
      )}
      {highlightRenders.map((r) => (
        <path
          key={`hl-${r.territoryId}`}
          d={r.pathD}
          fill="none"
          stroke={SELECTION_STROKE}
          strokeWidth={SELECTION_STROKE_WIDTH}
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />
      ))}
    </svg>
  );
}
