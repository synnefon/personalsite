/**
 * Optimized color manipulation and conversion utilities
 */

// Fast hex -> rgb, avoids parseInt for fixed-length common cases
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex;
  if (h[0] === "#") h = h.slice(1);
  // Common 6-char HEX, skip parseInt loops for common case
  if (h.length === 6) {
    return {
      r: (16 * hexCharToNibble(h[0]) + hexCharToNibble(h[1])),
      g: (16 * hexCharToNibble(h[2]) + hexCharToNibble(h[3])),
      b: (16 * hexCharToNibble(h[4]) + hexCharToNibble(h[5])),
    };
  }
  // 3-character shorthand e.g. #fc1
  if (h.length === 3) {
    return {
      r: 17 * hexCharToNibble(h[0]),
      g: 17 * hexCharToNibble(h[1]),
      b: 17 * hexCharToNibble(h[2]),
    };
  }
  // fallback
  return { r: 255, g: 221, b: 0 };
}

// Much faster than parseInt for single hex digit
function hexCharToNibble(c: string): number {
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;
  return 0;
}

// h, s, l in [0,1] for s/l
export function hslToHex(h: number, s: number, l: number): string {
  // Fast HSL to RGB, inline float ops; avoid Math.min inside loop
  const a = s * Math.min(l, 1 - l);
  function f(n: number) {
    const k = (n + h / 30) % 12;
    const x = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    // Clamp, no toString(16) padStart call if possible:
    let val = Math.round(255 * x);
    val = val < 0 ? 0 : val > 255 ? 255 : val;
    // Branch-free 2-digit HEX
    return hex2(val);
  }
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Fast int->2 digit lowercase hex string
function hex2(n: number): string {
  if (n < 16) return "0" + n.toString(16);
  return n.toString(16);
}

export function hexToHue(hex: string): number {
  // Use inlined logic for rgb decomposition; slightly reduces allocations
  const { r, g, b } = hexToRgb(hex);
  const rf = r * 0.00392156862745098; // 1/255
  const gf = g * 0.00392156862745098;
  const bf = b * 0.00392156862745098;

  const max = rf > gf ? (rf > bf ? rf : bf) : (gf > bf ? gf : bf);
  const min = rf < gf ? (rf < bf ? rf : bf) : (gf < bf ? gf : bf);
  const delta = max - min;

  if (delta < 1e-6) return 0; // Faster float compare

  let hue: number;
  if (max === rf) {
    hue = ((gf - bf) / delta) % 6;
  } else if (max === gf) {
    hue = (bf - rf) / delta + 2;
  } else {
    hue = (rf - gf) / delta + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return hue;
}

// Remove double clamp and branch, use Math.round directly, keep tight
export function lerpInt(a: number, b: number, t: number): number {
  // (b-a)*t is fast, sometimes t=0 or t=1 exactly, so avoid floating error
  const v = a + (b - a) * t;
  // Clamp in a single pass
  return v <= 0 ? 0 : v >= 255 ? 255 : (0.5 + v) | 0;
}

// Use unsigned right shift for fast Uint32 RGBA
export function packRgba(r: number, g: number, b: number, a: number): number {
  // >>> 0 forces Uint32, improves perf in some engines
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function buildHeatLut256(lowHex: string, highHex: string): Uint32Array {
  const lo = hexToRgb(lowHex);
  const hi = hexToRgb(highHex);

  const lut = new Uint32Array(256);
  // Hoist for reuse
  const r0 = lo.r, r1 = hi.r;
  const g0 = lo.g, g1 = hi.g;
  const b0 = lo.b, b1 = hi.b;

  for (let i = 0; i < 256; ++i) {
    // Inline t, save divisions if possible
    const t = i * 0.00392156862745098; // i / 255
    const r = (r0 + (r1 - r0) * t + 0.5) | 0;
    const g = (g0 + (g1 - g0) * t + 0.5) | 0;
    const b = (b0 + (b1 - b0) * t + 0.5) | 0;
    lut[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return lut;
}
