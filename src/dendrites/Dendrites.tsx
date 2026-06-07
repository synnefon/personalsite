import { ReactElement, useEffect, useRef } from "react";
import { CONFIG } from "./config.ts";
import { createBalls, drawBalls, stepBalls } from "./engine.ts";
import { applyInteractions } from "./interactions.ts";

import React from "react";
import "../styles/dendrites.css";

/**
 * Dendrites — balls zooming around a full-screen canvas, with a programmable
 * interaction layer (see interactions.ts).
 *
 * Simulation state lives in a plain array inside the effect, not React state:
 * the loop mutates it ~60x/second and draws straight to the canvas, so React
 * never needs to re-render.
 */
export default function Dendrites(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Logical (CSS-pixel) size; kept in sync on resize.
    let width = window.innerWidth;
    let height = window.innerHeight;

    // Size the backing store for crisp rendering on retina displays, then
    // draw in CSS pixels by scaling the context by the device pixel ratio.
    const resize = (): void => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const balls = createBalls(width, height);

    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number): void => {
      // Normalize elapsed time to 60fps "frames" so motion is refresh-rate
      // independent; clamp so a backgrounded tab doesn't teleport everything.
      const dt = Math.min(2, (now - lastTime) / (1000 / 60));
      lastTime = now;

      stepBalls(balls, width, height, dt);

      ctx.fillStyle = CONFIG.background;
      ctx.fillRect(0, 0, width, height);

      applyInteractions(balls, width, height);
      drawBalls(ctx, balls);

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="dendrites-canvas" />;
}
