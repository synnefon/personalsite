import { useCallback, useEffect, useRef, RefObject } from "react";
import {
  computeParticleCount,
  createParticles,
  stepSimulationOnePairPass,
} from "../physics.ts";
import { renderFrame } from "../rendering.ts";
import { ensureGrid } from "../helpers.ts";
import { FIXED_MS, MAX_CATCHUP_STEPS, SIM } from "../config.ts";
import type { Particle, SpatialGrid, Vec2 } from "../config.ts";

interface UseSimulationParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ctxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
  pointerDownRef: React.MutableRefObject<boolean>;
  pointerCoolingRef: React.MutableRefObject<boolean>;
  pointerPosRef: React.MutableRefObject<Vec2>;
  speedRef: React.MutableRefObject<number>;
  heatLutRef: React.MutableRefObject<Uint32Array>;
  updateWaveform: () => void;
}

export function useSimulation({
  canvasRef,
  ctxRef,
  pointerDownRef,
  pointerCoolingRef,
  pointerPosRef,
  speedRef,
  heatLutRef,
  updateWaveform,
}: UseSimulationParams) {
  const particlesRef = useRef<Particle[]>([]);
  const imageRef = useRef<ImageData | null>(null);
  const neighborCountsRef = useRef<Uint16Array>(new Uint16Array(0));
  const particleCountRef = useRef<number | null>(null);
  const gridRef = useRef<SpatialGrid | null>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 });
  const rafRef = useRef<number | null>(null);
  const clockRef = useRef<{ last: number; acc: number }>({ last: 0, acc: 0 });

  // Canvas initial setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = window.innerWidth,
      h = window.innerHeight;
    sizeRef.current = { w, h };
    canvas.width = w;
    canvas.height = h;
    ctxRef.current = canvas.getContext("2d");
    imageRef.current = null;
  }, [canvasRef, ctxRef]);

  // Initialize particles
  const initializeParticlesOnce = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (particleCountRef.current === null)
      particleCountRef.current = computeParticleCount(w, h);
    const count = particleCountRef.current;
    particlesRef.current = createParticles(w, h, count);
    neighborCountsRef.current = new Uint16Array(count);
    ensureGrid(gridRef, w, h, count, SIM.COHESION_RADIUS);
  }, []);

  // Update simulation one step
  const updateOnce = useCallback(() => {
    const g = gridRef.current,
      { w, h } = sizeRef.current;
    if (!g) return;
    stepSimulationOnePairPass(
      particlesRef.current,
      w,
      h,
      pointerDownRef.current,
      pointerPosRef.current,
      neighborCountsRef.current,
      speedRef.current,
      g,
      pointerCoolingRef.current
    );
  }, [pointerDownRef, pointerPosRef, speedRef, pointerCoolingRef]);

  // Draw frame
  const draw = useCallback(() => {
    const canvas = canvasRef.current,
      ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    renderFrame(
      ctx,
      canvas,
      particlesRef.current,
      imageRef,
      heatLutRef.current
    );
  }, [canvasRef, ctxRef, heatLutRef]);

  // Animation loop
  const animate = useCallback(
    (now: number) => {
      const clock = clockRef.current;
      if (!clock.last) clock.last = now;
      let delta = now - clock.last;
      clock.last = now;
      clock.acc += Math.min(250, Math.max(0, delta));
      let steps = 0;
      while (clock.acc >= FIXED_MS && steps < MAX_CATCHUP_STEPS) {
        updateOnce();
        clock.acc -= FIXED_MS;
        steps++;
      }
      if (clock.acc >= FIXED_MS) clock.acc = 0;

      updateWaveform();
      draw();
      rafRef.current = requestAnimationFrame(animate);
    },
    [draw, updateOnce, updateWaveform]
  );

  // Start simulation
  const startSimulation = useCallback(() => {
    initializeParticlesOnce();
    clockRef.current = { last: 0, acc: 0 };
    requestAnimationFrame(() => draw());
    rafRef.current = requestAnimationFrame(animate);
  }, [initializeParticlesOnce, draw, animate]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return {
    particlesRef,
    sizeRef,
    imageRef,
    startSimulation,
  };
}
