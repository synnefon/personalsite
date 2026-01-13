/**
 * Central export point for all lava lamp utilities
 */

// Types
export type { Particle, Vec2, SpatialGrid, AudioSource, NowPlayingInfo } from "./types.ts";
export type { WebGLRendererContext } from "./webglRenderer.ts";

// Constants
export {
  AUDIO_SOURCES,
  DEFAULT_HIGH,
  DEFAULT_LOW,
  SIM,
  RENDER,
  CLUMPS,
  PARTICLES_PER_PIXEL,
  MAX_PARTICLES,
  SPEED,
  FIXED_FPS,
  FIXED_MS,
  MAX_CATCHUP_STEPS,
  MUSIC_TIME_KEY,
} from "./constants.ts";

// Device detection
export { detectMobile } from "./deviceDetection.ts";

// Color utilities
export {
  hexToRgb,
  hslToHex,
  hexToHue,
  lerpInt,
  packRgba,
  buildHeatLut256,
} from "./colorUtils.ts";

// Physics
export {
  clamp01,
  lerp,
  randInCircle,
  bounceInBounds,
  clampAllToBounds,
  computeParticleCount,
  createParticles,
  applyBuoyancyAndGravity,
  applyFriction,
  integrate,
  applyPointerHeat,
  applyCohesionImpulse,
  applyHeatConduction,
  applyBottomHeatOrAirCooling,
  stepSimulationOnePairPass,
} from "./physics.ts";

// Spatial grid
export { ensureGrid, gridIndex } from "./spatialGrid.ts";

// Rendering
export { ensureImageData, drawMetaballs, drawMetaballsWithGrid, renderFrame } from "./rendering.ts";

// Storage
export { readSavedMusicTimeSeconds, writeSavedMusicTimeSeconds } from "./storage.ts";

// Speed utilities
export { clampInt, indexToSpeed, speedToNearestIndex } from "./speedUtils.ts";

// WebGL renderer
export {
  initWebGLRenderer,
  renderFrameWebGL,
  cleanupWebGLRenderer,
} from "./webglRenderer.ts";
