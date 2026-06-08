import { Ball, Sim } from "./types.ts";

/** Round to 2 decimals to keep the exported file small. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Serialize just the stuck cluster (seed + stuck balls) to a tightly-cropped SVG. */
export function clusterToSvg(sim: Sim): string {
  const balls: Ball[] = [];
  for (const cell of sim.grid.values()) balls.push(...cell);
  if (balls.length === 0) return "";

  // Tight bounds: extend each ball by its radius so nothing clips.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of balls) {
    if (b.x - b.radius < minX) minX = b.x - b.radius;
    if (b.y - b.radius < minY) minY = b.y - b.radius;
    if (b.x + b.radius > maxX) maxX = b.x + b.radius;
    if (b.y + b.radius > maxY) maxY = b.y + b.radius;
  }
  const w = round(maxX - minX);
  const h = round(maxY - minY);

  const circles = balls
    .map(
      (b) =>
        `  <circle cx="${round(b.x - minX)}" cy="${round(b.y - minY)}" r="${round(b.radius)}" fill="${b.color}" />`,
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${circles}\n</svg>\n`;
}

/** Trigger a browser download of the given SVG markup. */
export function downloadSvg(svg: string, filename = "dendrite.svg"): void {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
