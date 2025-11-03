import { COORD_OFFSET, KEY_MULTIPLIER } from "./constants.ts";

// helpers for Set keys - using offset encoding to correctly handle negative coordinates
export const makeKey = (x: number, y: number): number =>
  (x + COORD_OFFSET) * KEY_MULTIPLIER + (y + COORD_OFFSET);

export const parseKey = (k: number): [number, number] => {
  const x = Math.floor(k / KEY_MULTIPLIER) - COORD_OFFSET;
  const y = (k % KEY_MULTIPLIER) - COORD_OFFSET;
  return [x, y];
};
