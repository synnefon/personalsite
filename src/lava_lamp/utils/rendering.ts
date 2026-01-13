/**
 * Canvas rendering utilities for metaball effect
 */

import type React from "react";
import type { Particle } from "./types.ts";
import { RENDER } from "./constants.ts";
import { packRgba } from "./colorUtils.ts";

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
  heatLut256: Uint32Array
): void {
  const imageData = ensureImageData(ctx, imageRef, canvas.width, canvas.height);
  drawMetaballs(imageData, particles, canvas.width, canvas.height, heatLut256);
  ctx.putImageData(imageData, 0, 0);
}
