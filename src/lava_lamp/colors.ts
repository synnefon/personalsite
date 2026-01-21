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

// RGB to HSL conversion
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  // Normalize to [0, 1]
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;

  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  // Lightness
  const l = (max + min) / 2;

  // Achromatic (gray)
  if (delta < 0.00001) {
    return { h: 0, s: 0, l };
  }

  // Saturation
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  // Hue
  let h: number;
  if (max === rf) {
    h = ((gf - bf) / delta + (gf < bf ? 6 : 0)) / 6;
  } else if (max === gf) {
    h = ((bf - rf) / delta + 2) / 6;
  } else {
    h = ((rf - gf) / delta + 4) / 6;
  }

  return { h, s, l };
}

// HSL to RGB conversion
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r: number, g: number, b: number;

  if (s < 0.00001) {
    // Achromatic
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

// Hex to HSL (returns h in [0,1], s and l in [0,1])
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

// Use unsigned right shift for fast Uint32 RGBA
export function packRgba(r: number, g: number, b: number, a: number): number {
  // >>> 0 forces Uint32, improves perf in some engines
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function buildHeatLut256(lowHex: string, highHex: string): Uint32Array {
  // Convert to HSL for better color interpolation
  const loHsl = hexToHsl(lowHex); // h, s, l in [0,1]
  const hiHsl = hexToHsl(highHex);

  const lut = new Uint32Array(256);

  for (let i = 0; i < 256; ++i) {
    const t = i * 0.00392156862745098; // i / 255

    // Interpolate in HSL space
    // Handle hue wrapping for shortest path
    let h0 = loHsl.h;
    let h1 = hiHsl.h;
    if (Math.abs(h1 - h0) > 0.5) {
      if (h1 > h0) {
        h0 += 1;
      } else {
        h1 += 1;
      }
    }
    let h = h0 + (h1 - h0) * t;
    if (h > 1) h -= 1;

    const s = loHsl.s + (hiHsl.s - loHsl.s) * t;
    const l = loHsl.l + (hiHsl.l - loHsl.l) * t;

    // Convert back to RGB using hslToRgb
    const { r, g, b } = hslToRgb(h, s, l);
    lut[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return lut;
}
