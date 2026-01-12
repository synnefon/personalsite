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

// --- Colors: keep state (for controlled inputs) + refs (fast access elsewhere) ---
const DEFAULT_HIGH = "#ffdd00";
const DEFAULT_LOW = "#ff5500";

// --- Types ---
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heat: number; // [0..1]
}

type Vec2 = { x: number; y: number };

type SpatialGrid = {
  cellSize: number;
  cols: number;
  rows: number;
  heads: Int32Array; // length cols*rows, head index or -1
  next: Int32Array; // length particleCount, next index or -1
};

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

// --- Speed control (indexed slider) ---
const SPEED = {
  MIN: 0.0,
  MAX: 5,
  DEFAULT: 0.25,
  STEPS: 10, // number of discrete positions
} as const;

// --- Fixed update rate (independent of render cost / screen size) ---
const FIXED_FPS = 60;
const FIXED_MS = 1000 / FIXED_FPS;
const MAX_CATCHUP_STEPS = 4;

// --- Persisted audio position ---
const MUSIC_TIME_KEY = "lavaLamp.musicTimeSeconds";

// --- Utils ---
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampInt(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpInt(a: number, b: number, t: number): number {
  const v = a + (b - a) * t;
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function randInCircle(radius: number): Vec2 {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * radius;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
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

function computeParticleCount(width: number, height: number): number {
  const baselineArea = BASELINE.WIDTH * BASELINE.HEIGHT;
  const currentArea = width * height;

  const density = BASELINE.PARTICLES / baselineArea;
  const scaled = Math.round(currentArea * density);

  return Math.max(200, Math.min(2000, scaled));
}

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

// Note: MIN=0 is special; idx 0 => frozen-ish. idx 1..(STEPS-1) => (0..MAX] in log space.
function indexToSpeed(idx: number): number {
  if (idx <= 0) return 0;

  const steps = SPEED.STEPS;
  if (idx >= steps) return SPEED.MAX;

  // normalized position excluding 0
  const t = idx / steps; // idx=steps/2 => midpoint

  // calibrated so midpoint ≈ 0.5
  const targetMidSpeed = 0.5;
  const minPositive = (targetMidSpeed * targetMidSpeed) / SPEED.MAX;

  const minLog = Math.log(minPositive);
  const maxLog = Math.log(SPEED.MAX);

  return Math.exp(lerp(minLog, maxLog, t));
}

function speedToNearestIndex(speed: number): number {
  if (speed <= 0) return 0;

  const steps = SPEED.STEPS;
  const last = steps - 1;

  let best = 1;
  let bestErr = Infinity;
  const target = Math.log(speed);

  for (let i = 1; i <= last; i++) {
    const s = indexToSpeed(i);
    const err = Math.abs(Math.log(s) - target);
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  return best;
}

// --- Color / LUT ---
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace("#", "");
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  return { r: 255, g: 221, b: 0 };
}

function packRgba(r: number, g: number, b: number, a: number): number {
  // Uint32Array view over ImageData.data.buffer (common little-endian fast path).
  return (a << 24) | (b << 16) | (g << 8) | r;
}

function buildHeatLut256(lowHex: string, highHex: string): Uint32Array {
  const lo = hexToRgb(lowHex);
  const hi = hexToRgb(highHex);

  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const r = lerpInt(lo.r, hi.r, t);
    const g = lerpInt(lo.g, hi.g, t);
    const b = lerpInt(lo.b, hi.b, t);
    lut[i] = packRgba(r, g, b, 255);
  }
  return lut;
}

// --- Spatial grid helpers ---
function ensureGrid(
  gridRef: React.MutableRefObject<SpatialGrid | null>,
  width: number,
  height: number,
  count: number,
  cellSize: number
) {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const cells = cols * rows;

  const g = gridRef.current;
  if (
    !g ||
    g.cols !== cols ||
    g.rows !== rows ||
    g.cellSize !== cellSize ||
    g.next.length !== count ||
    g.heads.length !== cells
  ) {
    gridRef.current = {
      cellSize,
      cols,
      rows,
      heads: new Int32Array(cells),
      next: new Int32Array(count),
    };
  }
}

function gridIndex(g: SpatialGrid, cx: number, cy: number): number {
  return cy * g.cols + cx;
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

// --- Physics (grid-accelerated cohesion/conduction) ---
export function stepSimulationOnePairPass(
  particles: Particle[],
  width: number,
  height: number,
  pointerDown: boolean,
  pointerPos: Vec2,
  neighborCounts: Uint16Array,
  timeScale: number,
  grid: SpatialGrid
) {
  const dt = Math.max(0, Math.min(4.0, timeScale));

  // Pass 1: integrate + pointer heat + reset neighbors + bounds
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    applyBuoyancyAndGravity(p, dt);
    applyFriction(p, dt);
    integrate(p, dt);

    if (pointerDown) applyPointerHeat(p, pointerPos, dt);

    neighborCounts[i] = 0;
    bounceInBounds(p, width, height);
  }

  // dt=0 => frozen (no cohesion/conduction/cooling), but still clamp
  if (dt === 0) {
    for (let i = 0; i < particles.length; i++) {
      particles[i].heat = clamp01(particles[i].heat);
    }
    clampAllToBounds(particles, width, height);
    return;
  }

  // Build spatial hash
  grid.heads.fill(-1);
  const invCell = 1 / grid.cellSize;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    let cx = (p.x * invCell) | 0;
    let cy = (p.y * invCell) | 0;

    if (cx < 0) cx = 0;
    else if (cx >= grid.cols) cx = grid.cols - 1;

    if (cy < 0) cy = 0;
    else if (cy >= grid.rows) cy = grid.rows - 1;

    const cell = gridIndex(grid, cx, cy);
    grid.next[i] = grid.heads[cell];
    grid.heads[cell] = i;
  }

  // Pass 2: local neighbor forces + conduction
  const r = SIM.COHESION_RADIUS;
  const r2 = r * r;

  for (let i = 0; i < particles.length; i++) {
    const p1 = particles[i];

    let cx = (p1.x * invCell) | 0;
    let cy = (p1.y * invCell) | 0;

    if (cx < 0) cx = 0;
    else if (cx >= grid.cols) cx = grid.cols - 1;

    if (cy < 0) cy = 0;
    else if (cy >= grid.rows) cy = grid.rows - 1;

    const x0 = cx > 0 ? cx - 1 : cx;
    const x1 = cx + 1 < grid.cols ? cx + 1 : cx;
    const y0 = cy > 0 ? cy - 1 : cy;
    const y1 = cy + 1 < grid.rows ? cy + 1 : cy;

    for (let ny = y0; ny <= y1; ny++) {
      for (let nx = x0; nx <= x1; nx++) {
        let j = grid.heads[gridIndex(grid, nx, ny)];
        while (j !== -1) {
          if (j > i) {
            const p2 = particles[j];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const d2 = dx * dx + dy * dy;

            if (d2 > 0 && d2 < r2) {
              neighborCounts[i]++;
              neighborCounts[j]++;

              const d = Math.sqrt(d2);
              applyCohesionImpulse(p1, p2, dx, dy, d, dt);
              applyHeatConduction(p1, p2, dt);
            }
          }
          j = grid.next[j];
        }
      }
    }
  }

  // Pass 3: heat source / cooling
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    applyBottomHeatOrAirCooling(p, height, neighborCounts[i], dt);
    p.heat = clamp01(p.heat);
  }

  clampAllToBounds(particles, width, height);
}

function applyBuoyancyAndGravity(p: Particle, dt: number) {
  const buoyancy = p.heat * p.heat * SIM.BUOYANCY;
  p.vy += (SIM.GRAVITY - buoyancy) * dt;
}

function applyFriction(p: Particle, dt: number) {
  const f = Math.pow(SIM.FRICTION, dt);
  p.vx *= f;
  p.vy *= f;
}

function integrate(p: Particle, dt: number) {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

function applyPointerHeat(p: Particle, pointerPos: Vec2, dt: number) {
  const dx = p.x - pointerPos.x;
  const dy = p.y - pointerPos.y;
  const d2 = dx * dx + dy * dy;
  const r = SIM.MOUSE_HEAT_RADIUS;
  const r2 = r * r;

  if (d2 < r2) {
    const d = Math.sqrt(d2);
    const intensity = 1 - d * (1 / r);
    p.heat += SIM.HEAT_RATE * 2 * intensity * dt;
  }
}

function applyCohesionImpulse(
  p1: Particle,
  p2: Particle,
  dx: number,
  dy: number,
  d: number,
  dt: number
) {
  const force = SIM.COHESION_STRENGTH * (1 - d * (1 / SIM.COHESION_RADIUS));
  const invD = 1 / d;
  const fx = dx * invD * force * dt;
  const fy = dy * invD * force * dt;

  p1.vx += fx;
  p1.vy += fy;
  p2.vx -= fx;
  p2.vy -= fy;
}

function applyHeatConduction(p1: Particle, p2: Particle, dt: number) {
  const heatDiff = p1.heat - p2.heat;
  const conduction = heatDiff * SIM.HEAT_CONDUCTION * dt;
  p1.heat -= conduction;
  p2.heat += conduction;
}

function applyBottomHeatOrAirCooling(
  p: Particle,
  height: number,
  neighborCount: number,
  dt: number
) {
  const distanceFromBottom = height - p.y;

  if (distanceFromBottom < SIM.HEAT_SOURCE_DISTANCE) {
    const intensity = 1 - distanceFromBottom * (1 / SIM.HEAT_SOURCE_DISTANCE);
    p.heat += SIM.HEAT_RATE * intensity * dt;
    return;
  }

  const maxNeighbors = 8;
  const neighbors = neighborCount < maxNeighbors ? neighborCount : maxNeighbors;
  const airExposure = 1 - neighbors / maxNeighbors;

  p.heat -= SIM.COOL_RATE * (0.2 + airExposure * 0.8) * dt;
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

function drawMetaballs(
  imageData: ImageData,
  particles: Particle[],
  canvasWidth: number,
  canvasHeight: number,
  heatLut256: Uint32Array
) {
  const pixelSize = RENDER.PIXEL_SIZE;
  const threshold = RENDER.THRESHOLD;
  const r2 = RENDER.PARTICLE_RADIUS * RENDER.PARTICLE_RADIUS;

  const data32 = new Uint32Array(imageData.data.buffer);

  // 7) Don’t clear twice: clear ONCE here to opaque black
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

function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  particles: Particle[],
  imageRef: React.MutableRefObject<ImageData | null>,
  heatLut256: Uint32Array
) {
  const imageData = ensureImageData(ctx, imageRef, canvas.width, canvas.height);
  drawMetaballs(imageData, particles, canvas.width, canvas.height, heatLut256);
  ctx.putImageData(imageData, 0, 0);
}

// --- Component ---
export default function LavaLamp(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const rafRef = useRef<number | null>(null);

  const particlesRef = useRef<Particle[]>([]);
  const imageRef = useRef<ImageData | null>(null);
  const neighborCountsRef = useRef<Uint16Array>(new Uint16Array(0));
  const particleCountRef = useRef<number | null>(null);

  const gridRef = useRef<SpatialGrid | null>(null);

  // 5) Cache dimensions ONCE (read only on page load)
  const sizeRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 });

  const gameMusic = useMemo(() => new PersonalAudio(musicAudioNoise, true), []);
  const clickSound = useMemo(() => new PersonalAudio(clickAudioNoise, false), []);

  const [hasStarted, setHasStarted] = useState(false);

  const pointerDownRef = useRef(false);
  const pointerPosRef = useRef<Vec2>({ x: 0, y: 0 });

  // Speed slider state
  const defaultSpeedIdx = useMemo(() => speedToNearestIndex(SPEED.DEFAULT), []);
  const [speedIdx, setSpeedIdx] = useState<number>(defaultSpeedIdx);
  const speedRef = useRef<number>(SPEED.DEFAULT);

  useEffect(() => {
    speedRef.current = indexToSpeed(speedIdx);
  }, [speedIdx]);

  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  const [volume, setVolume] = useState(1.0);
  useEffect(() => {
    gameMusic.volume = volume;
  }, [volume, gameMusic]);

  const lavaLowColorRef = useRef(DEFAULT_LOW);
  const lavaHighColorRef = useRef(DEFAULT_HIGH);

  const [lavaLowColor, setLavaLowColor] = useState(DEFAULT_LOW);
  const [lavaHighColor, setLavaHighColor] = useState(DEFAULT_HIGH);

  const heatLutRef = useRef<Uint32Array>(buildHeatLut256(DEFAULT_LOW, DEFAULT_HIGH));

  // Rebuild LUT whenever colors change; redraw immediately if running.
  useEffect(() => {
    lavaLowColorRef.current = lavaLowColor;
    lavaHighColorRef.current = lavaHighColor;
    heatLutRef.current = buildHeatLut256(lavaLowColor, lavaHighColor);
  }, [lavaLowColor, lavaHighColor, hasStarted]);

  // 5) Cache canvas/context + dimensions (only read on initial mount)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    sizeRef.current = { w, h };

    canvas.width = w;
    canvas.height = h;

    ctxRef.current = canvas.getContext("2d");

    // ensure image data matches cached size
    imageRef.current = null;

    // no resize listener by request
  }, []);

  const initializeParticlesOnce = useCallback(() => {
    const { w, h } = sizeRef.current;

    if (particleCountRef.current === null) {
      particleCountRef.current = computeParticleCount(w, h);
    }

    const count = particleCountRef.current;
    particlesRef.current = createParticles(w, h, count);
    neighborCountsRef.current = new Uint16Array(count);

    ensureGrid(gridRef, w, h, count, SIM.COHESION_RADIUS);
  }, []);

  const saveMusicPosition = useCallback(() => {
    writeSavedMusicTimeSeconds(gameMusic.currentTime ?? 0);
  }, [gameMusic]);

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

  const updateOnce = useCallback(() => {
    const g = gridRef.current;
    if (!g) return;

    const { w, h } = sizeRef.current;

    stepSimulationOnePairPass(
      particlesRef.current,
      w,
      h,
      pointerDownRef.current,
      pointerPosRef.current,
      neighborCountsRef.current,
      speedRef.current,
      g
    );
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    renderFrame(ctx, canvas, particlesRef.current, imageRef, heatLutRef.current);
  }, []);

  // 0) Fixed update cadence: updates happen at FIXED_FPS regardless of render speed.
  const clockRef = useRef<{ last: number; acc: number }>({ last: 0, acc: 0 });

  const animate = useCallback((now: number) => {
    const clock = clockRef.current;

    if (clock.last === 0) clock.last = now;
    const delta = now - clock.last;
    clock.last = now;

    // Clamp massive deltas (tab-switch etc.)
    clock.acc += Math.min(250, Math.max(0, delta));

    let steps = 0;
    while (clock.acc >= FIXED_MS && steps < MAX_CATCHUP_STEPS) {
      updateOnce();
      clock.acc -= FIXED_MS;
      steps++;
    }

    // Drop extra backlog to avoid death spiral
    if (clock.acc >= FIXED_MS) clock.acc = 0;

    draw();
    rafRef.current = requestAnimationFrame(animate);
  }, [draw, updateOnce]);

  // Pointer handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toLocal = (e: PointerEvent): Vec2 => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      pointerDownRef.current = true;
      pointerPosRef.current = toLocal(e);
    };
    const onMove = (e: PointerEvent) => {
      pointerPosRef.current = toLocal(e);
    };
    const onUp = () => {
      pointerDownRef.current = false;
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

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

      // reset fixed-timestep clock
      clockRef.current = { last: 0, acc: 0 };

      // draw a first frame immediately
      requestAnimationFrame(() => draw());

      // start RAF loop
      rafRef.current = requestAnimationFrame(animate);
    }

    resumeMusicFromSavedTime();
    gameMusic.volume = 1.0;
    gameMusic.play();
  }, [
    animate,
    draw,
    gameMusic,
    hasStarted,
    initializeParticlesOnce,
    playClick,
    resumeMusicFromSavedTime,
  ]);

  const initialCanvasSize = useMemo(
    () => ({ w: window.innerWidth, h: window.innerHeight }),
    []
  );

  const lastSpeedIdx = SPEED.STEPS - 1;

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
          <button
            type="button"
            className="lava-lamp-menu-toggle"
            onClick={toggleMenu}
            aria-label={menuOpen ? "Hide menu" : "Show menu"}
            aria-pressed={menuOpen}
          >
            {menuOpen ? "✕" : "☰"}
          </button>

          {menuOpen && (
            <div className="lava-lamp-menu">
              {/* Speed */}
              <div className="lava-lamp-control-block">
                <div className="lava-lamp-control-header">
                  <div className="lava-lamp-control-title">speed: {speedIdx}</div>
                </div>

                <div className="lava-lamp-slider-wrap">
                  <input
                    className="lava-lamp-slider"
                    type="range"
                    min={0}
                    max={lastSpeedIdx}
                    step={1}
                    value={speedIdx}
                    onChange={(e) =>
                      setSpeedIdx(clampInt(Number(e.target.value), 0, lastSpeedIdx))
                    }
                    aria-label="Simulation speed"
                  />
                </div>
              </div>

              {/* Volume */}
              <div className="lava-lamp-control-block">
                <div className="lava-lamp-control-header">
                  <div className="lava-lamp-control-title">
                    volume: {Math.round(volume * 100)}%
                  </div>
                </div>

                <div className="lava-lamp-slider-wrap">
                  <input
                    className="lava-lamp-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    aria-label="Music volume"
                  />
                </div>
              </div>

              {/* Lava colors */}
              <div className="lava-lamp-control-block">
                <div className="lava-lamp-control-header">
                  <div className="lava-lamp-control-title">lava colors</div>
                </div>

                <div className="lava-lamp-color-row">

                  <label className="lava-lamp-color-label">
                    hot
                    <input
                      className="lava-lamp-color-input"
                      type="color"
                      value={lavaHighColor}
                      onChange={(e) => setLavaHighColor(e.target.value)}
                      aria-label="Lava high color"
                    />
                  </label>

                  <label className="lava-lamp-color-label">
                    cool
                    <input
                      className="lava-lamp-color-input"
                      type="color"
                      value={lavaLowColor}
                      onChange={(e) => setLavaLowColor(e.target.value)}
                      aria-label="Lava low color"
                    />
                  </label>

                  <button
                    type="button"
                    className="lava-lamp-color-reset"
                    onClick={() => {
                      setLavaLowColor(DEFAULT_LOW);
                      setLavaHighColor(DEFAULT_HIGH);
                    }}
                  >
                    reset
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
