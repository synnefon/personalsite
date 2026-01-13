/**
 * Canvas rendering utilities for metaball effect
 */

import type React from "react";
import type { Particle, SpatialGrid } from "./types.ts";
import { RENDER } from "./constants.ts";
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
  const pixelSize = RENDER.PIXEL_SIZE;
  const threshold = RENDER.THRESHOLD;
  const r2 = RENDER.PARTICLE_RADIUS * RENDER.PARTICLE_RADIUS;

  // Max distance a particle can influence (3x radius for practical cutoff)
  const maxInfluenceDist = RENDER.PARTICLE_RADIUS * 3;
  const maxDistSq = maxInfluenceDist * maxInfluenceDist;

  const data32 = new Uint32Array(imageData.data.buffer);

  // Clear canvas to opaque black
  const black = packRgba(0, 0, 0, 255);
  data32.fill(black);

  const w = canvasWidth;
  const invCell = 1 / grid.cellSize;

  for (let y = 0; y < canvasHeight; y += pixelSize) {
    for (let x = 0; x < canvasWidth; x += pixelSize) {
      let influenceSum = 0;
      let heatWeightedSum = 0;

      // Calculate which grid cells to check
      const cx = Math.floor(x * invCell);
      const cy = Math.floor(y * invCell);

      // Check 3x3 grid around pixel
      const x0 = Math.max(0, cx - 1);
      const x1 = Math.min(grid.cols - 1, cx + 1);
      const y0 = Math.max(0, cy - 1);
      const y1 = Math.min(grid.rows - 1, cy + 1);

      // Only iterate through particles in nearby cells
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          let particleIdx = grid.heads[gridIndex(grid, gx, gy)];

          while (particleIdx !== -1) {
            const p = particles[particleIdx];
            const dx = x - p.x;
            const dy = y - p.y;
            const distSq = dx * dx + dy * dy;

            // Skip if particle is too far to have meaningful influence
            if (distSq < maxDistSq) {
              const influence = r2 / (distSq + 1);
              influenceSum += influence;
              heatWeightedSum += influence * p.heat;
            }

            particleIdx = grid.next[particleIdx];
          }
        }
      }

      if (influenceSum <= threshold) continue;

      const heat = heatWeightedSum / influenceSum;
      const lutIdx = heat <= 0 ? 0 : heat >= 1 ? 255 : (heat * 255) | 0;
      const rgba = heatLut256[lutIdx];

      // Fill pixel block
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

/**
 * Legacy metaball rendering (checks all particles for every pixel)
 * Kept for compatibility/fallback
 */
export function drawMetaballs(
  imageData: ImageData,
  particles: Particle[],
  canvasWidth: number,
  canvasHeight: number,
  heatLut256: Uint32Array
): void {
  const pixelSize = RENDER.PIXEL_SIZE;
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

  if (grid) {
    drawMetaballsWithGrid(imageData, particles, canvas.width, canvas.height, heatLut256, grid);
  } else {
    drawMetaballs(imageData, particles, canvas.width, canvas.height, heatLut256);
  }

  ctx.putImageData(imageData, 0, 0);
}
