import React, {
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "../styles/lavalamp.css";

import musicAudioNoise from "../assets/lavaLamp/guitar.mp3";
import clickAudioNoise from "../assets/lavaLamp/click.mp3";
import { PersonalAudio } from "../util/Audio";

// --- Types ---
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heat: number; // [0..1]
}

type Vec2 = { x: number; y: number };

// --- Constants ---
const SIM = {
  GRAVITY: 0.01,
  BUOYANCY: 0.04,
  FRICTION: 0.98,

  HEAT_RATE: 0.005,
  COOL_RATE: 0.0017,
  HEAT_CONDUCTION: 0.002,

  HEAT_SOURCE_DISTANCE: 45,

  COHESION_RADIUS: 25,
  COHESION_STRENGTH: 0.0035,

  MOUSE_HEAT_RADIUS: 100,
} as const;

const RENDER = {
  PARTICLE_RADIUS: 10,
  PIXEL_SIZE: 6,
  THRESHOLD: 0.8,
} as const;

const CLUMPS = {
  COUNT: 15,
  RADIUS: 50,
  TOP_HALF_PROB: 0.3,
} as const;

// Baseline density: preserves "look" across screens, computed once per page load.
const BASELINE = {
  WIDTH: 1920,
  HEIGHT: 1080,
  PARTICLES: 1200,
} as const;

function computeParticleCount(width: number, height: number): number {
  const baselineArea = BASELINE.WIDTH * BASELINE.HEIGHT;
  const currentArea = width * height;

  const density = BASELINE.PARTICLES / baselineArea;
  const scaled = Math.round(currentArea * density);

  return Math.max(200, Math.min(2000, scaled));
}

// --- Persisted audio position ---
const MUSIC_TIME_KEY = "lavaLamp.musicTimeSeconds";

function readSavedMusicTimeSeconds(): number {
  try {
    const raw = localStorage.getItem(MUSIC_TIME_KEY);
    if (!raw) return 0;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

function writeSavedMusicTimeSeconds(seconds: number) {
  try {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    localStorage.setItem(MUSIC_TIME_KEY, String(seconds));
  } catch {
    // ignore
  }
}

// --- Utils ---
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hypot2(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

function randInCircle(radius: number): Vec2 {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * radius;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function setCanvasToWindow(canvas: HTMLCanvasElement) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function bounceInBounds(p: Particle, width: number, height: number) {
  if (p.x < 0) {
    p.x = 0;
    p.vx *= -0.5;
  } else if (p.x > width) {
    p.x = width;
    p.vx *= -0.5;
  }

  if (p.y < 0) {
    p.y = 0;
    p.vy *= -0.5;
  } else if (p.y > height) {
    p.y = height;
    p.vy *= -0.5;
  }
}

function clampAllToBounds(particles: Particle[], width: number, height: number) {
  for (let i = 0; i < particles.length; i++) {
    bounceInBounds(particles[i], width, height);
  }
}

// --- Init ---
function createParticles(width: number, height: number, count: number): Particle[] {
  const particles: Particle[] = [];
  const particlesPerClump = Math.floor(count / CLUMPS.COUNT);

  for (let i = 0; i < CLUMPS.COUNT; i++) {
    const centerX = Math.random() * width;
    const centerY =
      Math.random() < CLUMPS.TOP_HALF_PROB
        ? Math.random() * height * 0.5
        : height * 0.5 + Math.random() * height * 0.5;

    const clumpHeat = Math.random();
    for (let j = 0; j < particlesPerClump; j++) {
      const offset = randInCircle(CLUMPS.RADIUS);
      particles.push({
        x: centerX + offset.x,
        y: centerY + offset.y,
        vx: 0,
        vy: 0,
        heat: clumpHeat,
      });
    }
  }

  while (particles.length < count) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
      heat: 0,
    });
  }

  return particles;
}

// --- Physics (Option 2: single pair-pass on post-move positions) ---
function stepSimulationOnePairPass(
  particles: Particle[],
  width: number,
  height: number,
  pointerDown: boolean,
  pointerPos: Vec2,
  neighborCounts: Uint16Array
) {
  const n = particles.length;

  const gravity = SIM.GRAVITY;
  const buoyancyK = SIM.BUOYANCY;
  const friction = SIM.FRICTION;

  const mouseR = SIM.MOUSE_HEAT_RADIUS;
  const mouseRInv = 1 / mouseR;

  const heatRate = SIM.HEAT_RATE;
  const coolRate = SIM.COOL_RATE;

  const heatSrcDist = SIM.HEAT_SOURCE_DISTANCE;
  const heatSrcDistInv = 1 / heatSrcDist;

  const cohR = SIM.COHESION_RADIUS;
  const cohRInv = 1 / cohR;
  const cohStrength = SIM.COHESION_STRENGTH;

  const conductionK = SIM.HEAT_CONDUCTION;

  const pointerX = pointerPos.x;
  const pointerY = pointerPos.y;

  for (let i = 0; i < n; i++) {
    const p = particles[i];

    const buoyancy = p.heat * p.heat * buoyancyK;
    p.vy += gravity - buoyancy;

    p.vx *= friction;
    p.vy *= friction;

    p.x += p.vx;
    p.y += p.vy;

    if (pointerDown) {
      const dx = p.x - pointerX;
      const dy = p.y - pointerY;
      const d = hypot2(dx, dy);
      if (d < mouseR) {
        const intensity = 1 - d * mouseRInv;
        p.heat += heatRate * 2 * intensity;
      }
    }

    neighborCounts[i] = 0;
    bounceInBounds(p, width, height);
  }

  for (let i = 0; i < n; i++) {
    const p1 = particles[i];
    for (let j = i + 1; j < n; j++) {
      const p2 = particles[j];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const d = hypot2(dx, dy);

      if (d > 0 && d < cohR) {
        neighborCounts[i]++;
        neighborCounts[j]++;

        const force = cohStrength * (1 - d * cohRInv);
        const invD = 1 / d;
        const fx = dx * invD * force;
        const fy = dy * invD * force;

        p1.vx += fx;
        p1.vy += fy;
        p2.vx -= fx;
        p2.vy -= fy;

        const heatDiff = p1.heat - p2.heat;
        const conduction = heatDiff * conductionK;
        p1.heat -= conduction;
        p2.heat += conduction;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const p = particles[i];
    const distanceFromBottom = height - p.y;

    if (distanceFromBottom < heatSrcDist) {
      const intensity = 1 - distanceFromBottom * heatSrcDistInv;
      p.heat += heatRate * intensity;
    } else {
      const maxNeighbors = 8;
      const neighbors =
        neighborCounts[i] < maxNeighbors ? neighborCounts[i] : maxNeighbors;
      const airExposure = 1 - neighbors / maxNeighbors;
      p.heat -= coolRate * (0.2 + airExposure * 0.8);
    }

    p.heat = clamp01(p.heat);
  }

  clampAllToBounds(particles, width, height);
}

// --- Render helpers ---
function ensureImageData(
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

function heatToRGB(heat: number): { r: number; g: number; b: number } {
  const t = clamp01(heat);
  return { r: 255, g: Math.round(50 + 205 * t), b: 0 };
}

function setPixelBlock(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number
) {
  for (let py = 0; py < size; py++) {
    const yy = y + py;
    if (yy >= canvasHeight) continue;

    const rowBase = yy * canvasWidth * 4;
    for (let px = 0; px < size; px++) {
      const xx = x + px;
      if (xx >= canvasWidth) continue;

      const idx = rowBase + xx * 4;
      data[idx + 0] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
}

function influenceAtPoint(p: Particle, x: number, y: number, r2: number): number {
  const dx = x - p.x;
  const dy = y - p.y;
  const distSq = dx * dx + dy * dy;
  return r2 / (distSq + 1);
}

function drawMetaballs(
  imageData: ImageData,
  particles: Particle[],
  canvasWidth: number,
  canvasHeight: number
) {
  const data = imageData.data;
  data.fill(0);

  const pixelSize = RENDER.PIXEL_SIZE;
  const threshold = RENDER.THRESHOLD;
  const r2 = RENDER.PARTICLE_RADIUS * RENDER.PARTICLE_RADIUS;

  for (let y = 0; y < canvasHeight; y += pixelSize) {
    for (let x = 0; x < canvasWidth; x += pixelSize) {
      let influenceSum = 0;
      let heatWeightedSum = 0;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const influence = influenceAtPoint(p, x, y, r2);
        influenceSum += influence;
        heatWeightedSum += influence * p.heat;
      }

      if (influenceSum <= threshold) continue;

      const heat = heatWeightedSum / influenceSum;
      const { r, g, b } = heatToRGB(heat);

      setPixelBlock(data, canvasWidth, canvasHeight, x, y, pixelSize, r, g, b);
    }
  }
}

function renderFrame(
  canvas: HTMLCanvasElement,
  particles: Particle[],
  imageRef: React.MutableRefObject<ImageData | null>
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const imageData = ensureImageData(ctx, imageRef, canvas.width, canvas.height);
  drawMetaballs(imageData, particles, canvas.width, canvas.height);
  ctx.putImageData(imageData, 0, 0);
}

// --- Component ---
export default function LavaLamp(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const particlesRef = useRef<Particle[]>([]);
  const imageRef = useRef<ImageData | null>(null);
  const neighborCountsRef = useRef<Uint16Array>(new Uint16Array(0));
  const particleCountRef = useRef<number | null>(null);

  const gameMusic = useMemo(() => new PersonalAudio(musicAudioNoise, true), []);
  const clickSound = useMemo(() => new PersonalAudio(clickAudioNoise, false), []);

  // No lava until first Start.
  const [hasStarted, setHasStarted] = useState(false);
  const [running, setRunning] = useState(false);

  const pointerDownRef = useRef(false);
  const pointerPosRef = useRef<Vec2>({ x: 0, y: 0 });

  const initializeParticlesOnce = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (particleCountRef.current === null) {
      particleCountRef.current = computeParticleCount(w, h);
    }

    const count = particleCountRef.current;
    particlesRef.current = createParticles(w, h, count);
    neighborCountsRef.current = new Uint16Array(count);
  }, []);

  const saveMusicPosition = useCallback(() => {
    // Persist even if paused/unmounted so we can resume after navigation.
    writeSavedMusicTimeSeconds(gameMusic.currentTime ?? 0);
  }, [gameMusic]);

  // Periodically persist while the lamp is running (so back-navigation resumes close to where you left)
  useEffect(() => {
    if (!hasStarted) return;

    const tick = () => saveMusicPosition();
    const id = window.setInterval(tick, 1000);

    const onPageHide = () => saveMusicPosition();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveMusicPosition();
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasStarted, saveMusicPosition]);

  // Cleanup only (do NOT autoplay); persist time first
  useEffect(() => {
    return () => {
      saveMusicPosition();

      gameMusic.pause();
      gameMusic.volume = 0;
      gameMusic.reset();

      clickSound.pause();
      clickSound.volume = 0;
      clickSound.reset();
    };
  }, [gameMusic, clickSound, saveMusicPosition]);

  const update = useCallback(() => {
    stepSimulationOnePairPass(
      particlesRef.current,
      window.innerWidth,
      window.innerHeight,
      pointerDownRef.current,
      pointerPosRef.current,
      neighborCountsRef.current
    );
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderFrame(canvas, particlesRef.current, imageRef);
  }, []);

  const animate = useCallback(() => {
    if (!running) return;
    update();
    draw();
    rafRef.current = requestAnimationFrame(animate);
  }, [running, update, draw]);

  // Resize canvas only (no particle re-init, no drawing lava before start)
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setCanvasToWindow(canvas);
      imageRef.current = null;

      if (hasStarted) draw();
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw, hasStarted]);

  // Start/stop RAF loop
  useEffect(() => {
    if (!running) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running, animate]);

  const playClick = useCallback(() => {
    try {
      clickSound.volume = 1.0;
      clickSound.currentTime = 0;
      clickSound.reset();
      clickSound.play();
    } catch {
      // ignore
    }
  }, [clickSound]);

  const resumeMusicFromSavedTime = useCallback(() => {
    const t = readSavedMusicTimeSeconds();
    try {
      // If duration is known and we stored something past the end, wrap.
      const duration = (gameMusic as any).duration as number | undefined;
      if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
        gameMusic.currentTime = t % duration;
      } else {
        gameMusic.currentTime = t;
      }
    } catch {
      // ignore
    }
  }, [gameMusic]);

  const startLamp = useCallback(() => {
    playClick();

    if (!hasStarted) {
      setHasStarted(true);
      initializeParticlesOnce();
      requestAnimationFrame(() => draw());
    }

    setRunning(true);

    // gesture-driven: resume from last saved time, then play (looping via PersonalAudio ctor flag)
    resumeMusicFromSavedTime();
    gameMusic.volume = 1.0;
    gameMusic.play();
  }, [
    draw,
    gameMusic,
    hasStarted,
    initializeParticlesOnce,
    playClick,
    resumeMusicFromSavedTime,
  ]);

  // Old play/pause button behavior (after started)
  const toggleRunning = useCallback(() => {
    playClick();

    setRunning((prev) => {
      const next = !prev;

      if (next) {
        resumeMusicFromSavedTime();
        gameMusic.volume = 1.0;
        gameMusic.play();
      } else {
        saveMusicPosition();
        gameMusic.pause();
      }

      return next;
    });
  }, [gameMusic, playClick, resumeMusicFromSavedTime, saveMusicPosition]);

  const initialCanvasSize = useMemo(
    () => ({ w: window.innerWidth, h: window.innerHeight }),
    []
  );

  return (
    <div className="lava-lamp-container">
      <canvas
        ref={canvasRef}
        className="lava-lamp-canvas"
        width={initialCanvasSize.w}
        height={initialCanvasSize.h}
      />

      {!hasStarted ? (
        <div className="lava-lamp-start-overlay">
          <button
            type="button"
            className="lava-lamp-start"
            onClick={startLamp}
            aria-label="Start lava lamp"
          >
            START
          </button>
        </div>
      ) : (
        <div className="lava-lamp-controls">
          <button className="lava-lamp-button" onClick={toggleRunning}>
            {running ? "⏸" : "▶"}
          </button>
        </div>
      )}
    </div>
  );
}
