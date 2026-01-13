/**
 * Canvas rendering utilities for metaball effect (performance optimized)
 */

import type React from "react";
import type { Particle } from "./types.ts";
import { RENDER, computePixelSize } from "./constants.ts";
import { packRgba } from "./colorUtils.ts";

// Cached black value for fill (avoid recomputation)
const BLACK_RGBA = packRgba(0, 0, 0, 255);

/**
 * Ensures a properly-sized ImageData instance
 */
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
 * Rapidly fills a pixel block given a color.
 * Hot loop with tight bounds checking.
 */
function fillPixelBlockFast(
  data32: Uint32Array,
  x: number,
  y: number,
  px: number,
  w: number,
  h: number,
  rgba: number
) {
  const ymax = Math.min(y + px, h);
  const xmax = Math.min(x + px, w);
  for (let yy = y; yy < ymax; yy++) {
    let idx = yy * w + x;
    for (let xx = x; xx < xmax; xx++) {
      data32[idx++] = rgba;
    }
  }
}

/**
 * Metaball rendering (brute force for all particles per pixel).
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
  const particleRadiusSquared = RENDER.PARTICLE_RADIUS * RENDER.PARTICLE_RADIUS;
  const data32 = new Uint32Array(imageData.data.buffer);

  // Fill the entire image with black using the cached RGBA value.
  data32.fill(BLACK_RGBA);

  const width = canvasWidth;
  const height = canvasHeight;

  for (let y = 0; y < height; y += pixelSize) {
    for (let x = 0; x < width; x += pixelSize) {
      let influenceSum = 0;
      let heatSum = 0;

      // Calculate influence from all particles at this block's top-left corner.
      for (let i = 0; i < particles.length; ++i) {
        const p = particles[i];
        const dx = x - p.x;
        const dy = y - p.y;
        const distanceSquared = dx * dx + dy * dy;
        const influence = particleRadiusSquared / (distanceSquared + 1);

        influenceSum += influence;
        heatSum += influence * p.heat;
      }

      // Only render if total influence exceeds the threshold.
      if (influenceSum <= threshold) continue;

      // Weighted average heat based on influence.
      const heat = heatSum / influenceSum;
      const lutIdx = heat <= 0 ? 0 : heat >= 1 ? 255 : (heat * 255) | 0;
      const colorRgba = heatLut256[lutIdx];

      fillPixelBlockFast(data32, x, y, pixelSize, width, height, colorRgba);
    }
  }
}

/**
 * Renders a frame.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  particles: Particle[],
  imageRef: React.MutableRefObject<ImageData | null>,
  heatLut256: Uint32Array
): void {
  const imageData = ensureImageData(ctx, imageRef, canvas.width, canvas.height);
  const pixelSize = computePixelSize(canvas.width, canvas.height);

  drawMetaballs(
    imageData,
    particles,
    canvas.width,
    canvas.height,
    heatLut256,
    pixelSize
  );

  ctx.putImageData(imageData, 0, 0);
}
