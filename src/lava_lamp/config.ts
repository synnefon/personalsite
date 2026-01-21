/**
 * Configuration constants and type definitions for the Lava Lamp simulation
 */

// ============================================================================
// Types
// ============================================================================

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heat: number; // [0..1]
}

export type Vec2 = { x: number; y: number };

export interface SpatialGrid {
  cellSize: number;
  cols: number;
  rows: number;
  heads: Int32Array; // head index or -1
  next: Int32Array; // next index or -1
}

export type AudioSource = "redwood" | "kexp";

export interface NowPlayingInfo {
  song: string;
  artist: string;
  album: string;
  isAirbreak: boolean;
}

// ============================================================================
// Device Detection (inline to avoid separate file)
// ============================================================================

export const detectMobile = (): boolean => {
  const userAgent =
    navigator.userAgent ||
    navigator.vendor ||
    (window as Window & { opera?: string }).opera ||
    "";

  const mobileRegex =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUA = mobileRegex.test(userAgent);

  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 500;

  return isMobileUA || (hasTouch && isSmallScreen);
};

const isMobile = detectMobile();

// ============================================================================
// Constants
// ============================================================================

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
  COOL_RATE_BASE: 0.0017,
  HEAT_CONDUCTION: 0.002,

  HEAT_SOURCE_DISTANCE_BASE: 45,
  REFERENCE_HEIGHT: 1000, // Reference screen height for scaling

  COHESION_RADIUS: 25,
  COHESION_STRENGTH: 0.0035,

  MOUSE_HEAT_RADIUS: 100,
} as const;

/**
 * Calculate cooling rate based on screen height
 * Scales cooling rate proportionally with height to maintain consistent behavior
 */
export function computeCoolRate(height: number): number {
  return SIM.COOL_RATE_BASE * (height / SIM.REFERENCE_HEIGHT);
}

/**
 * Calculate heat source distance (bottom heater zone) based on screen height
 * Scales proportionally to maintain consistent heating behavior
 */
export function computeHeatSourceDistance(height: number): number {
  return SIM.HEAT_SOURCE_DISTANCE_BASE * (height / SIM.REFERENCE_HEIGHT);
}

// Rendering constants
export const RENDER = {
  PARTICLE_RADIUS: 10,
  THRESHOLD: 0.8,
} as const;

/**
 * Calculate adaptive pixel size based on screen dimensions
 * Target: ~14ms render time for 60fps
 */
export function computePixelSize(
  width: number,
  height: number,
  basePixelSize: number = 8
): number {
  const area = width * height;
  const scaleFactor = Math.sqrt(area / 1_288_920);
  const adaptivePixelSize = basePixelSize * scaleFactor;
  return Math.max(4, Math.min(24, Math.round(adaptivePixelSize)));
}

// Particle clustering configuration
export const CLUMPS = {
  COUNT: 15,
  RADIUS: isMobile ? 30 : 50,
  TOP_HALF_PROB: 0.3,
} as const;

/**
 * The density of the lava lamp simulation (particles per pixel).
 */
export const PARTICLES_PER_PIXEL = isMobile ? 0.00054 : 0.00061;

/**
 * Maximum number of particles regardless of screen size.
 */
export const MAX_PARTICLES = 2000;

// Speed control configuration
export const SPEED = {
  MIN: 0.0,
  MAX: 5,
  DEFAULT: 0.25,
  STEPS: 10,
} as const;

// Fixed update rate
export const FIXED_FPS = 60;
export const FIXED_MS = 1000 / FIXED_FPS;
export const MAX_CATCHUP_STEPS = 5;

// LocalStorage keys
export const MUSIC_TIME_KEY = "lava-lamp-music-time";
