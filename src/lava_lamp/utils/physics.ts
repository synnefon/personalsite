/**
 * Physics simulation and particle behavior
 */

import type { Particle, Vec2, SpatialGrid } from "./types.ts";
import { SIM, CLUMPS, PARTICLES_PER_PIXEL } from "./constants.ts";
import { gridIndex } from "./spatialGrid.ts";

// Math utilities
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function randInCircle(radius: number): Vec2 {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * radius;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

// Particle bounds checking
export function bounceInBounds(
  p: Particle,
  width: number,
  height: number
): void {
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

export function clampAllToBounds(
  particles: Particle[],
  width: number,
  height: number
): void {
  for (let i = 0; i < particles.length; i++) {
    bounceInBounds(particles[i], width, height);
  }
}

// Particle count calculation
export function computeParticleCount(width: number, height: number): number {
  const area = width * height;
  return Math.round(area * PARTICLES_PER_PIXEL);
}

// Particle creation
export function createParticles(
  width: number,
  height: number,
  count: number
): Particle[] {
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

// Physics forces
export function applyBuoyancyAndGravity(p: Particle, dt: number): void {
  const buoyancy = p.heat * p.heat * SIM.BUOYANCY;
  p.vy += (SIM.GRAVITY - buoyancy) * dt;
}

export function applyFriction(p: Particle, dt: number): void {
  const f = Math.pow(SIM.FRICTION, dt);
  p.vx *= f;
  p.vy *= f;
}

export function integrate(p: Particle, dt: number): void {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

export function applyPointerHeat(
  p: Particle,
  pointerPos: Vec2,
  dt: number
): void {
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

export function applyCohesionImpulse(
  p1: Particle,
  p2: Particle,
  dx: number,
  dy: number,
  d: number,
  dt: number
): void {
  const force = SIM.COHESION_STRENGTH * (1 - d * (1 / SIM.COHESION_RADIUS));
  const invD = 1 / d;
  const fx = dx * invD * force * dt;
  const fy = dy * invD * force * dt;

  p1.vx += fx;
  p1.vy += fy;
  p2.vx -= fx;
  p2.vy -= fy;
}

export function applyHeatConduction(
  p1: Particle,
  p2: Particle,
  dt: number
): void {
  const heatDiff = p1.heat - p2.heat;
  const conduction = heatDiff * SIM.HEAT_CONDUCTION * dt;
  p1.heat -= conduction;
  p2.heat += conduction;
}

export function applyBottomHeatOrAirCooling(
  p: Particle,
  height: number,
  neighborCount: number,
  dt: number
): void {
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

// Main simulation step
export function stepSimulationOnePairPass(
  particles: Particle[],
  width: number,
  height: number,
  pointerDown: boolean,
  pointerPos: Vec2,
  neighborCounts: Uint16Array,
  timeScale: number,
  grid: SpatialGrid
): void {
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

  // Pass 3: bottom heat / air cooling + clamp heat + bounds
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    applyBottomHeatOrAirCooling(p, height, neighborCounts[i], dt);
    p.heat = clamp01(p.heat);
  }

  clampAllToBounds(particles, width, height);
}
