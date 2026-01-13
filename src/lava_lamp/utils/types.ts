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

export type SpatialGrid = {
  cellSize: number;
  cols: number;
  rows: number;
  heads: Int32Array; // length cols*rows, head index or -1
  next: Int32Array; // length particleCount, next index or -1
};

export type AudioSource = "redwood" | "kexp";

export interface NowPlayingInfo {
  song: string;
  artist: string;
  album: string;
  isAirbreak: boolean;
}
