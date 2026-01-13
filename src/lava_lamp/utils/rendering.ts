/**
 * Canvas rendering utilities for metaball effect
 */

import type React from "react";
import type { Particle, SpatialGrid } from "./types.ts";
import { RENDER, computePixelSize } from "./constants.ts";
import { packRgba } from "./colorUtils.ts";
import { gridIndex } from "./spatialGrid.ts";

export function ensureImageData(
  ctx: CanvasRenderingContext2D,
  imageRef: React.MutableRefObject<ImageData | null>,
  width: number,
  height: number
): ImageData {
  const img = imageRef.current;
  if (!img || img.width !== width || img.height !== height) {
    imageRef.current = ctx.createImageData(width, height);
  }
  return imageRef.current!;
}

/**
 * Calculate influence from nearby particles for a pixel
 */
function calculatePixelInfluence(
  x: number,
  y: number,
  particles: Particle[],
  grid: SpatialGrid,
  r2: number,
  maxDistSq: number,
  invCell: number
): { influenceSum: number; heatWeightedSum: number } {
  let influenceSum = 0;
  let heatWeightedSum = 0;

  const cx = Math.floor(x * invCell);
  const cy = Math.floor(y * invCell);

  const x0 = Math.max(0, cx - 1);
  const x1 = Math.min(grid.cols - 1, cx + 1);
  const y0 = Math.max(0, cy - 1);
  const y1 = Math.min(grid.rows - 1, cy + 1);

  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      let particleIdx = grid.heads[gridIndex(grid, gx, gy)];

      while (particleIdx !== -1) {
        const p = particles[particleIdx];
        const dx = x - p.x;
        const dy = y - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < maxDistSq) {
          const influence = r2 / (distSq + 1);
          influenceSum += influence;
          heatWeightedSum += influence * p.heat;
        }

        particleIdx = grid.next[particleIdx];
      }
    }
  }

  return { influenceSum, heatWeightedSum };
}

/**
 * Fill a pixel block with the given color
 */
function fillPixelBlock(
  data32: Uint32Array,
  x: number,
  y: number,
  pixelSize: number,
  canvasWidth: number,
  canvasHeight: number,
  rgba: number
): void {
  const w = canvasWidth;
  for (let py = 0; py < pixelSize; py++) {
    const yy = y + py;
    if (yy >= canvasHeight) break;

    let idx = yy * w + x;
    const rowEnd = Math.min(x + pixelSize, w);
    for (let xx = x; xx < rowEnd; xx++) {
      data32[idx++] = rgba;
    }
  }
}

/**
 * Optimized metaball rendering using spatial grid
 * Only checks particles near each pixel instead of all particles
 */
export function drawMetaballsWithGrid(
  imageData: ImageData,
  particles: Particle[],
  canvasWidth: number,
  canvasHeight: number,
  heatLut256: Uint32Array,
  grid: SpatialGrid
): void {
  const pixelSize = computePixelSize(canvasWidth, canvasHeight);
  const threshold = RENDER.THRESHOLD;
  const r2 = RENDER.PARTICLE_RADIUS * RENDER.PARTICLE_RADIUS;
  const maxInfluenceDist = RENDER.PARTICLE_RADIUS * 3;
  const maxDistSq = maxInfluenceDist * maxInfluenceDist;

  const data32 = new Uint32Array(imageData.data.buffer);
  const black = packRgba(0, 0, 0, 255);
  data32.fill(black);

  const invCell = 1 / grid.cellSize;

  for (let y = 0; y < canvasHeight; y += pixelSize) {
    for (let x = 0; x < canvasWidth; x += pixelSize) {
      const { influenceSum, heatWeightedSum } = calculatePixelInfluence(
        x,
        y,
        particles,
        grid,
        r2,
        maxDistSq,
        invCell
      );

      if (influenceSum <= threshold) continue;

      const heat = heatWeightedSum / influenceSum;
      const lutIdx = heat <= 0 ? 0 : heat >= 1 ? 255 : (heat * 255) | 0;
      const rgba = heatLut256[lutIdx];

      fillPixelBlock(data32, x, y, pixelSize, canvasWidth, canvasHeight, rgba);
    }
  }
}

/**
 * Legacy metaball rendering (checks all particles for every pixel)
 * Kept for compatibility/fallback
 */
export function drawMetaballs(
  imageData: ImageData,
  particles: Particle[],
  canvasWidth: number,
  canvasHeight: number,
  heatLut256: Uint32Array,
  pixelSize: number
): void {
  const threshold = RENDER.THRESHOLD;
  const r2 = RENDER.PARTICLE_RADIUS * RENDER.PARTICLE_RADIUS;

  const data32 = new Uint32Array(imageData.data.buffer);

  // Clear canvas to opaque black
  const black = packRgba(0, 0, 0, 255);
  data32.fill(black);

  const w = canvasWidth;

  for (let y = 0; y < canvasHeight; y += pixelSize) {
    for (let x = 0; x < canvasWidth; x += pixelSize) {
      let influenceSum = 0;
      let heatWeightedSum = 0;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = x - p.x;
        const dy = y - p.y;
        const distSq = dx * dx + dy * dy;
        const influence = r2 / (distSq + 1);

        influenceSum += influence;
        heatWeightedSum += influence * p.heat;
      }

      if (influenceSum <= threshold) continue;

      const heat = heatWeightedSum / influenceSum;
      const lutIdx = heat <= 0 ? 0 : heat >= 1 ? 255 : (heat * 255) | 0;
      const rgba = heatLut256[lutIdx];

      for (let py = 0; py < pixelSize; py++) {
        const yy = y + py;
        if (yy >= canvasHeight) break;

        let idx = yy * w + x;
        const rowEnd = Math.min(x + pixelSize, w);
        for (let xx = x; xx < rowEnd; xx++) {
          data32[idx++] = rgba;
        }
      }
    }
  }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  particles: Particle[],
  imageRef: React.MutableRefObject<ImageData | null>,
  heatLut256: Uint32Array,
  grid?: SpatialGrid
): void {
  const imageData = ensureImageData(ctx, imageRef, canvas.width, canvas.height);
  const pixelSize = computePixelSize(canvas.width, canvas.height);

  if (grid) {
    drawMetaballsWithGrid(imageData, particles, canvas.width, canvas.height, heatLut256, grid);
  } else {
    drawMetaballs(imageData, particles, canvas.width, canvas.height, heatLut256, pixelSize);
  }

  ctx.putImageData(imageData, 0, 0);
}
