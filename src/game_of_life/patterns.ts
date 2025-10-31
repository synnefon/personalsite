/**
 * Conway's Game of Life - Starting Patterns
 *
 * Each pattern is defined as an array of [x, y] coordinates.
 * Add new patterns to the PATTERNS array to make them available for random selection.
 */

export type Pattern = [number, number][];

export interface PatternConfig {
  name: string;
  pattern: Pattern;
}

const GLIDER: Pattern = [
  [25, 25],
  [25, 26],
  [24, 26],
  [25, 27],
  [26, 27],
];

const HOLLOW_SQUARES_PATTERN: Pattern = [
  // First 3x3 hollow square
  [20, 20], [21, 20], [22, 20],
  [20, 21], [22, 21], // hollow center - skip [21, 21]
  [20, 22], [21, 22], [22, 22],

  // Second 3x3 hollow square (1 cell gap)
  [24, 20], [25, 20], [26, 20],
  [24, 21], [26, 21], // hollow center - skip [25, 21]
  [24, 22], [25, 22], [26, 22],
];

const GLIDER_GUN_PATTERN: Pattern = [
  // Left square
  [5, 20], [5, 21], [6, 20], [6, 21],

  // Left part of gun
  [15, 20], [15, 21], [15, 22],
  [16, 19], [16, 23],
  [17, 18], [17, 24],
  [18, 18], [18, 24],
  [19, 21],
  [20, 19], [20, 23],
  [21, 20], [21, 21], [21, 22],
  [22, 21],

  // Right part of gun
  [25, 18], [25, 19], [25, 20],
  [26, 18], [26, 19], [26, 20],
  [27, 17], [27, 21],

  [29, 16], [29, 17], [29, 21], [29, 22],

  // Right square
  [39, 18], [39, 19], [40, 18], [40, 19],
];

const ACORN: Pattern = [
  // Evolves for 5,206 generations before stabilizing
  [24, 25],
  [26, 26],
  [23, 27], [24, 27], [27, 27], [28, 27], [29, 27],
];

const R_PENTOMINO: Pattern = [
  // Evolves for 1,103 generations
  [25, 24], [26, 24],
  [24, 25], [25, 25],
  [25, 26],
];

const DIEHARD: Pattern = [
  // Vanishes after 130 generations
  [31, 24],
  [25, 25], [26, 25],
  [26, 26], [30, 26], [31, 26], [32, 26],
];

const PULSAR: Pattern = [
  // Period-3 oscillator
  // Top section
  [20, 18], [21, 18], [22, 18], [26, 18], [27, 18], [28, 18],
  [18, 20], [23, 20], [25, 20], [30, 20],
  [18, 21], [23, 21], [25, 21], [30, 21],
  [18, 22], [23, 22], [25, 22], [30, 22],
  [20, 23], [21, 23], [22, 23], [26, 23], [27, 23], [28, 23],

  // Middle gap at row 24

  // Bottom section
  [20, 25], [21, 25], [22, 25], [26, 25], [27, 25], [28, 25],
  [18, 26], [23, 26], [25, 26], [30, 26],
  [18, 27], [23, 27], [25, 27], [30, 27],
  [18, 28], [23, 28], [25, 28], [30, 28],
  [20, 30], [21, 30], [22, 30], [26, 30], [27, 30], [28, 30],
];

const LWSS: Pattern = [
  // Lightweight Spaceship - travels horizontally
  [25, 20], [28, 20],
  [24, 21],
  [24, 22], [28, 22],
  [24, 23], [25, 23], [26, 23], [27, 23],
];

/**
 * All available starting patterns
 * Add new patterns here to include them in random selection
 */
export const PATTERNS: PatternConfig[] = [
  {
    name: "Glider",
    pattern: GLIDER,
  },
  {
    name: "Hollow Squares",
    pattern: HOLLOW_SQUARES_PATTERN,
  },
  {
    name: "Gosper Glider Gun",
    pattern: GLIDER_GUN_PATTERN,
  },
  {
    name: "Acorn",
    pattern: ACORN,
  },
  {
    name: "R-pentomino",
    pattern: R_PENTOMINO,
  },
  {
    name: "Diehard",
    pattern: DIEHARD,
  },
  {
    name: "Pulsar",
    pattern: PULSAR,
  },
  {
    name: "Lightweight Spaceship",
    pattern: LWSS,
  },
];

/**
 * Select a random pattern from the available patterns
 */
export function getRandomPattern(): PatternConfig {
  const randomIndex = Math.floor(Math.random() * PATTERNS.length);
  return PATTERNS[randomIndex];
}
