// General-purpose constants (no magic numbers)
export const DEFAULT_TICK_PER_SEC = 4;
export const MAX_TICK_PER_SEC = 15;
export const CELL_SIZE = 20; // px - fixed cell size
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 4;
export const DRAG_THRESHOLD_PX = 5;

// Memory management constants
export const MAX_LIVE_CELLS = 50000; // Maximum cells before pausing simulation
export const CULLING_MARGIN = 100; // Cells beyond viewport to keep

// Key encoding constants - using offset encoding to handle negative coordinates
// JavaScript numbers have 53 bits of integer precision, so we can safely use:
// - 26 bits for x (range: -33M to +33M)
// - 26 bits for y (range: -33M to +33M)
export const COORD_OFFSET = 33554432; // 2^25 - offset to ensure coordinates are always positive
export const KEY_MULTIPLIER = 67108864; // 2^26 - multiplier for x coordinate

// Game of Life rules
export const LIFE_NEIGHBORS_BIRTH = 3;

// Gold: #d9a60e
export const COLOR_GOLD = { r: 217, g: 166, b: 14 };

export const WHEEL_ZOOM_DELTA = 0.1;
export const PINCH_ZOOM_DAMPING = 0.5;
export const ZOOM_DEFAULT_LEVEL = 1;
export const EXTRA_ROWS = 1; // for rendering extra padding
