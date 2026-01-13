/**
 * Core type definitions for the Lava Lamp simulation
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heat: number; // [0..1]
}

export type Vec2 = { x: number; y: number };

// Re-export SpatialGrid from spatialGrid.ts (single source of truth)
export type { SpatialGrid } from "./spatialGrid.ts";

export type AudioSource = "redwood" | "kexp";

export interface NowPlayingInfo {
  song: string;
  artist: string;
  album: string;
  isAirbreak: boolean;
}
