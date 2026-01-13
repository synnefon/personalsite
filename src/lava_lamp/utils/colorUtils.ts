/**
 * Color manipulation and conversion utilities
 */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace("#", "");
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  return { r: 255, g: 221, b: 0 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHue(hex: string): number {
  const rgb = hexToRgb(hex);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0;

  let hue = 0;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  return hue;
}

export function lerpInt(a: number, b: number, t: number): number {
  const v = a + (b - a) * t;
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export function packRgba(r: number, g: number, b: number, a: number): number {
  return (a << 24) | (b << 16) | (g << 8) | r;
}

export function buildHeatLut256(lowHex: string, highHex: string): Uint32Array {
  const lo = hexToRgb(lowHex);
  const hi = hexToRgb(highHex);

  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const r = lerpInt(lo.r, hi.r, t);
    const g = lerpInt(lo.g, hi.g, t);
    const b = lerpInt(lo.b, hi.b, t);
    lut[i] = packRgba(r, g, b, 255);
  }
  return lut;
}
