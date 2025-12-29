/**
 * Conway's Game of Life - Starting Patterns
 *
 * Patterns are defined in ASCII art format for readability:
 * - '*' = live cell
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
 * @param art - ASCII art string where '*' = live, '.' = dead
 */
function parsePattern(art: string): Pattern {
  const lines = art.trim().split("\n");
  const coords: Pattern = [];

  // Parse each cell
  lines.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const char = line[x];
      if (char === "*") {
        coords.push([x, y]);
      }
    }
  });

  return coords;
}

const TABLE: Pattern = parsePattern(`
****
*..*
`);

const HOLLOW_SQUARES: Pattern = parsePattern(`
***.***
*.*.*.*
***.***
`);

const GLIDER_GUN: Pattern = parsePattern(`
........................*...........
......................*.*..........*
............**......**............**
...........*...*....**..............*
**........*.....*...**..............*
**........*...*.**....*.*..........*
..........*.....*.......*...........
...........*...*....................
............**......................
`);

const ONE_TWO_THREE: Pattern = parsePattern(`
..**......
*..*......
**.*.**...
.*.*..*...
.*....*.**
..***.*.**
.....*....
....*.....
....**....
`);

// Evolves for 5,206 generations before stabilizing
const ACORN: Pattern = parsePattern(`
.*.....
...*...
**..***.
`);

// Evolves for 1,103 generations
const R_PENTOMINO: Pattern = parsePattern(`
.**
**.
.*.
`);

// Lightweight Spaceship - travels horizontally
const LWSS: Pattern = parsePattern(`
*..*
....*
*...*
.****
`);

// Period-15 oscillator
const PENTADECATHLON: Pattern = parsePattern(`
.*.
.*.
*.*
.*.
.*.
.*.
.*.
*.*
.*.
.*.
`);

// Methuselah - 17,331 generations before stabilizing
const RABBITS: Pattern = parsePattern(`
..*....*
**......
.**.***.
`);


/**
 * All available starting patterns
 * Add new patterns here to include them in random selection
 */
export const PATTERNS: PatternConfig[] = [
  {
    name: "hollow squares",
    pattern: HOLLOW_SQUARES,
  },
  {
    name: "gosper glider gun",
    pattern: GLIDER_GUN,
  },
  {
    name: "acorn",
    pattern: ACORN,
  },
  {
    name: "r-pentomino",
    pattern: R_PENTOMINO,
  },
  {
    name: "lightweight spaceship",
    pattern: LWSS,
  },
  {
    name: "pentadecathlon",
    pattern: PENTADECATHLON,
  },
  {
    name: "rabbits",
    pattern: RABBITS,
  },
  {
    name: "one two three",
    pattern: ONE_TWO_THREE,
  },
    {
      name: "table",
      pattern: TABLE,
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
