/**
 * Conway's Game of Life - Starting Patterns
 *
 * Patterns are defined in ASCII art format for readability:
 * - '█' (or 'O'/'o') = live cell
 * - '.' or ' ' = dead cell
 *
 * Patterns are defined starting from (0, 0). The game will auto-center them.
 */

export type Pattern = [number, number][];

export interface PatternConfig {
  name: string;
  pattern: Pattern;
}

/**
 * Parse ASCII art pattern into coordinate array
 * @param art - ASCII art string where '█'/'O'/'o' = live, '.' = dead
 */
function parsePattern(art: string): Pattern {
  const lines = art.trim().split('\n');
  const coords: Pattern = [];

  // Parse each cell
  lines.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const char = line[x];
      if (char === '█' || char === 'O' || char === 'o') {
        coords.push([x, y]);
      }
    }
  });

  return coords;
}

const HOLLOW_SQUARES: Pattern = parsePattern(`
███.███
█.█.█.█
███.███
`);

const GLIDER_GUN: Pattern = parsePattern(`
........................█...........
......................█.█...........
............██......██............██
...........█...█....██............██
██........█.....█...██..............
██........█...█.██....█.█...........
..........█.....█.......█...........
...........█...█....................
............██......................
`);

// Evolves for 5,206 generations before stabilizing
const ACORN: Pattern = parsePattern(`
.█.....
...█...
██..███
`);

// Evolves for 1,103 generations
const R_PENTOMINO: Pattern = parsePattern(`
.██
██.
.█.
`);

// Vanishes after 130 generations
const DIEHARD: Pattern = parsePattern(`
......█.
██......
.█...███
`);

// Period-3 oscillator
const PULSAR: Pattern = parsePattern(`
..███...███..

█....█.█....█
█....█.█....█
█....█.█....█
..███...███..

..███...███..
█....█.█....█
█....█.█....█
█....█.█....█

..███...███..
`);

// Lightweight Spaceship - travels horizontally
const LWSS: Pattern = parsePattern(`
█..█
....█
█...█
.████
`);

// Medium Weight Spaceship - travels horizontally
const MWSS: Pattern = parsePattern(`
█...█
.....█
█....█
.█████
..███.
`);

// Heavy Weight Spaceship - travels horizontally
const HWSS: Pattern = parsePattern(`
██...█
......█
█.....█
.██████
..████.
`);

// Period-15 oscillator
const PENTADECATHLON: Pattern = parsePattern(`
.█.
.█.
█.█
.█.
.█.
.█.
.█.
█.█
.█.
.█.
`);

// Period-8 oscillator with beautiful symmetry
const GALAXY: Pattern = parsePattern(`
██████..
██████..
█.......
█.....█.
█.....█.
.█.....█
.......█
..██████
..██████
`);

// Methuselah - 17,331 generations before stabilizing
const RABBITS: Pattern = parsePattern(`
███
███.
.█.
`);

// Compact glider gun - period-120
const SIMKIN_GLIDER_GUN: Pattern = parsePattern(`
██.....██
██.....██

....██
....██




......................██.██
.....................█.....█
.....................█......█..██
.....................███...█...██
..........................█



....................██
....................█
.....................███
.......................█
`);

/**
 * All available starting patterns
 * Add new patterns here to include them in random selection
 */
export const PATTERNS: PatternConfig[] = [
  {
    name: "Hollow Squares",
    pattern: HOLLOW_SQUARES,
  },
  {
    name: "Gosper Glider Gun",
    pattern: GLIDER_GUN,
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
  {
    name: "Medium Weight Spaceship",
    pattern: MWSS,
  },
  {
    name: "Heavy Weight Spaceship",
    pattern: HWSS,
  },
  {
    name: "Pentadecathlon",
    pattern: PENTADECATHLON,
  },
  {
    name: "Galaxy",
    pattern: GALAXY,
  },
  {
    name: "Rabbits",
    pattern: RABBITS,
  },
  {
    name: "Simkin Glider Gun",
    pattern: SIMKIN_GLIDER_GUN,
  },
];

/**
 * Select a random pattern from the available patterns
 */
export function getRandomPattern(): PatternConfig {
  const randomIndex = Math.floor(Math.random() * PATTERNS.length);
  const pattern = PATTERNS[randomIndex];
  console.log(`Starting pattern: ${pattern.name}`);
  return pattern;
}
