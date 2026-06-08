import React, { ReactElement, useEffect, useRef, useState } from "react";
import volumeDownIcon from "../assets/dendrites/volume_down.svg";
import volumeUpIcon from "../assets/dendrites/volume_up.svg";
import "../styles/dendrites.css";
import { CONFIG, Direction } from "./config.ts";
import {
  advanceSim,
  changeDirection,
  connectedToSource,
  drawSim,
  initializeSim,
  moveSource,
  resizeSim,
  setFreeRadius,
} from "./engine.ts";
import MenuBar from "./MenuBar.tsx";
import { initAudio, playConnections, setPitchForRadius, setMuted as setSoundMuted } from "./sound.ts";
import { clusterToSvg, downloadSvg } from "./svgExport.ts";
import { Ball, Sim } from "./types.ts";

/** Arrows point the way the balls flow, at that point of the diamond; ALL is the center hub. */
const DIRECTION_PAD = [
  { dir: Direction.BT, glyph: "▲", label: "Bottom to top", area: "up" },
  { dir: Direction.RL, glyph: "◀", label: "Right to left", area: "left" },
  { dir: Direction.LR, glyph: "▶", label: "Left to right", area: "right" },
  { dir: Direction.TB, glyph: "▼", label: "Top to bottom", area: "down" },
  {
    dir: Direction.ALL,
    glyph: (
      <span className="dendrites-all-glyph" aria-hidden="true">
        <span style={{ gridArea: "u" }}>▼</span>
        <span style={{ gridArea: "l" }}>▶</span>
        <span style={{ gridArea: "r" }}>◀</span>
        <span style={{ gridArea: "d" }}>▲</span>
      </span>
    ),
    label: "All directions (inward)",
    area: "all",
  },
];

/** One tick mark per integer radius stop (slider step is 1). */
const RADIUS_TICKS = Array.from(
  { length: CONFIG.maxBallRadius - CONFIG.minBallRadius + 1 },
  (_, i) => i,
);

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
  const [menuOpen, setMenuOpen] = useState(true);
  const [muted, setMuted] = useState(true);
  const [radius, setRadius] = useState<number>(CONFIG.ballRadius);
  useEffect(() => {
    setSoundMuted(muted);
  }, [muted]);


  const runningRef = useRef(running);
  const simRef = useRef<Sim | null>(null);
  const radiusRef = useRef(radius);
  function initSim() {
    simRef.current = initializeSim({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      direction: directionRef.current,
    });
    setFreeRadius(simRef.current, radiusRef.current);
  }
  useEffect(() => {
    if (!runningRef.current && simRef.current?.free.length === 0) {
      initSim();
    }
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    radiusRef.current = radius;
    if (simRef.current) setFreeRadius(simRef.current, radius);
    setPitchForRadius(radius);
  }, [radius]);

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
        advanceSim(
          simRef.current,
          width,
          height,
          dt,
          directionRef.current,
          () => setRunning(false),
          playConnections,
        );
      }
      drawSim(ctx, simRef.current, width, height);

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    window.addEventListener("resize", resize);

    // Drag the red source ball; grabbing it freezes the sim like the Stop button.
    let dragging = false;
    // The source's connected component, snapshotted on grab so the drag moves
    // only the structure fused to it and leaves detached fragments in place.
    let dragConnected: Set<Ball> | null = null;
    const overSource = (e: PointerEvent): boolean => {
      const sim = simRef.current;
      if (!sim) return false;
      const dx = e.clientX - sim.source.x;
      const dy = e.clientY - sim.source.y;
      const grab = sim.source.radius + 10;
      return dx * dx + dy * dy <= grab * grab;
    };
    const onPointerDown = (e: PointerEvent): void => {
      const sim = simRef.current;
      if (!sim || !overSource(e)) return;
      dragging = true;
      dragConnected = connectedToSource(sim);
      setRunning(false);
      canvas.style.cursor = "var(--grabbing)";
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent): void => {
      const sim = simRef.current;
      if (!sim) return;
      if (dragging && dragConnected) {
        const x = Math.max(0, Math.min(width, e.clientX));
        const y = Math.max(0, Math.min(height, e.clientY));
        moveSource(sim, x, y, dragConnected);
      } else {
        canvas.style.cursor = overSource(e) ? "var(--grab)" : "";
      }
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      dragConnected = null;
      canvas.style.cursor = overSource(e) ? "var(--grab)" : "";
      canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <canvas ref={canvasRef} className="dendrites-canvas" />
      <MenuBar open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)}>
        <button
          className="dendrites-action"
          onClick={() => {
            const svg = simRef.current && clusterToSvg(simRef.current);
            if (svg) downloadSvg(svg);
          }}
        >
          Export SVG
        </button>
        <button
          className="dendrites-toggle"
          onClick={() => {
            if (!running) initAudio();
            setRunning(!running);
          }}
        >
          {running ? "Stop" : "Start"}
        </button>
        <div className="dendrites-direction-pad">
          {DIRECTION_PAD.map(({ dir, glyph, label, area }) => (
            <button
              key={dir}
              aria-label={label}
              title={label}
              className={`dendrites-arrow${direction === dir ? " dendrites-arrow--active" : ""}`}
              style={{ gridArea: area }}
              onClick={() => setDirection(dir)}
            >
              {glyph}
            </button>
          ))}
        </div>
        <div className="dendrites-radius-wrap">
          <div
            className="dendrites-radius-ticks dendrites-radius-ticks--top"
            aria-hidden="true"
          >
            {RADIUS_TICKS.map((i) => (
              <span key={i} />
            ))}
          </div>
          <input
            type="range"
            className="dendrites-radius"
            min={CONFIG.minBallRadius}
            max={CONFIG.maxBallRadius}
            step={1}
            value={radius}
            onChange={(e) => setRadius(+e.target.value)}
            aria-label="Free ball radius"
            title="Free ball radius"
          />
          <div
            className="dendrites-radius-ticks dendrites-radius-ticks--bottom"
            aria-hidden="true"
          >
            {RADIUS_TICKS.map((i) => (
              <span key={i} />
            ))}
          </div>
        </div>
        <button
          className="dendrites-mute"
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          aria-pressed={muted}
          title={muted ? "Unmute sound" : "Mute sound"}
          onClick={() => {
            if (muted) initAudio();
            setMuted(!muted);
          }}
        >
          <img
            src={muted ? volumeDownIcon : volumeUpIcon}
            alt=""
            className={`dendrites-mute-icon${muted ? " muted" : " playing"}`}
            draggable={false}
          />
        </button>
      </MenuBar>
    </div>
  );
}
