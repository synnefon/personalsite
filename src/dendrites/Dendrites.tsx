import React, { ReactElement, useEffect, useRef, useState } from "react";
import "../styles/dendrites.css";
import { Direction } from "./config.ts";
import { applyInteractions, changeDirection, drawSim, initializeSim, resizeSim, stepSim } from "./engine.ts";
import MenuBar from "./MenuBar.tsx";
import { Sim } from "./types.ts";

/**
 * Dendrites — balls zooming around a full-screen canvas, with a programmable
 * interaction layer (see interactions.ts).
 *
 * Simulation state lives in a plain object inside the effect, not React state:
 * the loop mutates it ~60x/second and draws straight to the canvas, so React
 * never needs to re-render.
 */
export default function Dendrites(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [running, setRunning] = useState(false);
  const [direction, setDirection] = useState(Direction.LR);


  const runningRef = useRef(running);
  const simRef = useRef<Sim | null>(null);
  function initSim() {
    simRef.current = initializeSim({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      direction: directionRef.current,
    });
  }
  useEffect(() => {
    if (!runningRef.current && simRef.current?.free.length === 0) {
      initSim();
    }
    runningRef.current = running;
  }, [running]);

  const directionRef = useRef(direction);
  const prevDirectionRef = useRef(direction);
  useEffect(() => {
    prevDirectionRef.current = directionRef.current;
    directionRef.current = direction;
    if (simRef.current) {
      changeDirection(
        simRef.current,
        window.innerWidth,
        window.innerHeight,
        directionRef.current,
        prevDirectionRef.current,
      );
    }
  }, [direction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Logical (CSS-pixel) size; kept in sync on resize.
    let width = window.innerWidth;
    let height = window.innerHeight;

    initSim();

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
      if (simRef.current) {
        resizeSim(simRef.current, width, height, dpr);
      }
    };
    resize();

    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number): void => {
      // Normalize elapsed time to 60fps "frames" so motion is refresh-rate
      // independent; clamp so a backgrounded tab doesn't teleport everything.
      const dt = Math.min(2, (now - lastTime) / (1000 / 60));
      lastTime = now;

      if (!simRef.current) return;

      if (runningRef.current) {
        stepSim(simRef.current, width, height, dt, directionRef.current);
        applyInteractions(simRef.current, width, height, directionRef.current, () => setRunning(false));
      }
      drawSim(ctx, simRef.current, width, height);

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <canvas ref={canvasRef} className="dendrites-canvas" />
      <MenuBar>
        <button className="dendrites-toggle" onClick={() => setRunning(!running)}>
          {running ? "Stop" : "Start"}
        </button>
        <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
          <option value="LR">Left to Right</option>
          <option value="RL">Right to Left</option>
          <option value="TB">Top to Bottom</option>
          <option value="BT">Bottom to Top</option>
        </select>
      </MenuBar>
    </div>
  );
}
