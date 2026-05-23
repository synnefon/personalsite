export const COLS = 32;
export const ROWS = 24;
export const NUM_TERRITORIES = 38;
export const NUM_PLAYERS = 7;
export const HEX_SIZE = 18;

// Map-shaping knobs. Larger boundary probabilities chew the outer rectangle
// into an irregular blob; the small interior probability sprinkles holes.
export const VOID_PROB_BY_DISTANCE: ReadonlyArray<number> = [
  0.55, 0.22, 0.1, 0.04,
];
export const MIN_PLAYABLE_HEXES = 500;
export const MAX_GENERATION_ATTEMPTS = 40;

// Chunk size bounds. Lakes outside [MIN, MAX] are filled back in
// (deterministic, no retry). Territories outside their bounds trigger a
// regeneration since merging/splitting is messier.
export const MIN_TERRITORY_HEXES = 4;
export const MAX_TERRITORY_HEXES = 26;
export const MIN_LAKE_HEXES = 7;
export const MAX_LAKE_HEXES = 90;

// Seeds must be at least this many hex-steps apart. Gives every territory
// breathing room before it has to compete with a neighbor.
export const MIN_SEED_DISTANCE = 3;

// How many explicit interior lakes to seed per map. Random per-hex voiding
// almost never produces clusters big enough to survive MIN_LAKE_HEXES, so
// lakes are planted directly.
export const LAKE_COUNT_MIN = 4;
export const LAKE_COUNT_MAX = 10;

export type PlayerColor = {
  hex: COLOR_HEX;
  name: COLOR_NAME;
};

export enum COLOR_NAME {
  red = "red",
  green = "green",
  yellow = "yellow",
  blue = "blue",
  orange = "orange",
  purple = "purple",
  cyan = "cyan",
}

export enum COLOR_HEX {
  red = "#e6194b",
  green = "#3cb44b",
  yellow = "#ffe119",
  blue = "#4363d8",
  orange = "#f58231",
  purple = "#911eb4",
  cyan = "#42d4f4",
}

export const PLAYER_COLORS: ReadonlyArray<PlayerColor> = [
  { hex: COLOR_HEX.red, name: COLOR_NAME.red },
  { hex: COLOR_HEX.green, name: COLOR_NAME.green },
  { hex: COLOR_HEX.yellow, name: COLOR_NAME.yellow },
  { hex: COLOR_HEX.blue, name: COLOR_NAME.blue },
  { hex: COLOR_HEX.orange, name: COLOR_NAME.orange },
  { hex: COLOR_HEX.purple, name: COLOR_NAME.purple },
  { hex: COLOR_HEX.cyan, name: COLOR_NAME.cyan },
];

export const BORDER_COLOR = "#1b1726";

// The local user is always this player. Index 1 = green in PLAYER_COLORS.
export const USER_PLAYER_ID = 1;

// Dice setup. Every player starts with exactly this many dice, distributed
// randomly across their territories with each territory holding at least 1
// and at most MAX_DICE_PER_TERRITORY (classic Dicewars cap).
export const STARTING_DICE_PER_PLAYER = 12;
export const MAX_DICE_PER_TERRITORY = 8;
