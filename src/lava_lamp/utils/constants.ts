/**
 * Configuration constants for the Lava Lamp simulation
 */

import { detectMobile } from "./deviceDetection.ts";

const isMobile = detectMobile();

// Audio source configuration
export const AUDIO_SOURCES = {
  REDWOOD: "redwood",
  KEXP: "kexp",
} as const;

// Default color configuration
export const DEFAULT_HIGH = "#ffdd00";
export const DEFAULT_LOW = "#ff5500";

// Physics simulation constants
export const SIM = {
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

// Rendering constants
export const RENDER = {
  PARTICLE_RADIUS: 10,
  PIXEL_SIZE: 6,
  THRESHOLD: 0.8,
} as const;

// Particle clustering configuration
export const CLUMPS = {
  COUNT: 15,
  RADIUS: isMobile ? 30 : 50,
  TOP_HALF_PROB: 0.3,
} as const;

/**
 * The density of the lava lamp simulation (particles per pixel).
 * Higher values produce a greater number of particles (higher density).
 * Increase this number to make the lava lamp more dense.
 */
export const PARTICLES_PER_PIXEL = isMobile ? 0.00054 : 0.00061;

/**
 * Maximum number of particles regardless of screen size.
 * This prevents performance issues on very large screens.
 */
export const MAX_PARTICLES = 2000;

// Speed control configuration
export const SPEED = {
  MIN: 0.0,
  MAX: 5,
  DEFAULT: 0.25,
  STEPS: 10, // number of discrete positions
} as const;

// Fixed update rate (independent of render cost / screen size)
export const FIXED_FPS = 60;
export const FIXED_MS = 1000 / FIXED_FPS;
export const MAX_CATCHUP_STEPS = 5;

// LocalStorage keys
export const MUSIC_TIME_KEY = "lava-lamp-music-time";
