// SVG coordinate system: viewBox 0 0 1000 902
// Calibrated from US state path start points

export const SVG_W = 1000;
export const SVG_H = 902;
export const TRAIL_DAYS = 10;

export function toMapX(lon) {
  return (lon + 177.9548) / 0.119938;
}

export function toMapY(lat) {
  return (lat - 83.5197) / -0.075427;
}
