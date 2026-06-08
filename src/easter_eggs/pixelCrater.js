// Procedural pixel-art impact decals drawn to a transparent canvas.
// Returns a data URL, display size (w/h), and the impact anchor (ox/oy as
// fractions of the image) so callers can pin the hole to the click point.
//
// Scaling keeps the on-screen PIXEL size constant and changes the grid
// dimensions instead — bigger craters use *more* pixels, not bigger ones.

const PIXEL = 5; // css px per crater pixel — constant across all sizes
const SCORCH_GRID = 15; // base grid cells at scale 1
const MOLTEN_W = 16;
const MOLTEN_H = 22;
const TAU = Math.PI * 2;

const SCORCH = {
  void: "#080808",
  rim: ["#161210", "#241a14", "#322318", "#1d160f"],
  hot: ["#6e2f12", "#8a3b14", "#a85a1e"],
  hotChance: 0.22,
  crackRange: [2, 4],
};

// Molten metal heat gradient, hottest at the melted edge
const MOLTEN = {
  hole: ["#1c0a04", "#120703", "#230d05"],
  hot: ["#fff3c4", "#ffe28a", "#ffd23f"],
  glow: ["#ff9a1f", "#ff7a00", "#ff5e00"],
  cool: ["#cf3a0c", "#9e2407", "#7a1804"],
  coolDark: ["#3d0f04", "#250803"],
};

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function newCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d") };
}

// Random size multiplier, applied to the cell COUNT (not the pixel size)
function gridMul(scale) {
  return scale * (0.78 + Math.random() * 0.5);
}

function makeScorch(scale) {
  const G = Math.max(7, Math.round(SCORCH_GRID * gridMul(scale)));
  const { canvas, ctx } = newCanvas(G, G);
  const c = (G - 1) / 2;
  const radius = c * (0.7 + Math.random() * 0.25);

  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const dist = Math.hypot(x - c, y - c);
      const edge = radius + (Math.random() * 1.6 - 0.8);
      if (dist > edge) continue;

      let color;
      if (dist < radius * 0.4) color = SCORCH.void;
      else if (dist < radius * 0.7) color = pick(SCORCH.rim);
      else color = Math.random() < SCORCH.hotChance ? pick(SCORCH.hot) : pick(SCORCH.rim);

      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const [lo, hi] = SCORCH.crackRange;
  const cracks = lo + ((Math.random() * (hi - lo + 1)) | 0);
  for (let i = 0; i < cracks; i++) {
    let angle = Math.random() * Math.PI * 2;
    let px = c;
    let py = c;
    const len = radius + 1 + Math.random() * c;
    for (let step = 0; step < len; step++) {
      px += Math.cos(angle);
      py += Math.sin(angle);
      const ix = Math.round(px);
      const iy = Math.round(py);
      if (ix < 0 || iy < 0 || ix >= G || iy >= G) break;
      ctx.fillStyle = Math.random() < 0.3 ? pick(SCORCH.rim) : SCORCH.void;
      ctx.fillRect(ix, iy, 1, 1);
      angle += (Math.random() - 0.5) * 0.8;
    }
  }

  return { dataUrl: canvas.toDataURL(), w: G * PIXEL, h: G * PIXEL, ox: 0.5, oy: 0.5 };
}

function makeMolten(scale) {
  const mul = gridMul(scale);
  const W = Math.max(8, Math.round(MOLTEN_W * mul));
  const H = Math.max(11, Math.round(MOLTEN_H * mul));
  const { canvas, ctx } = newCanvas(W, H);
  const cx = (W - 1) / 2;
  const cy = H * (6.5 / MOLTEN_H); // hole sits near the top, proportionally
  const radius = cx * (0.55 + Math.random() * 0.15);

  // Irregular blob outline from a few angular harmonics with random phase
  const lobes = [
    { freq: 2 + ((Math.random() * 2) | 0), amp: 0.08 + Math.random() * 0.08, phase: Math.random() * TAU },
    { freq: 3 + ((Math.random() * 3) | 0), amp: 0.04 + Math.random() * 0.05, phase: Math.random() * TAU },
    { freq: 6 + ((Math.random() * 4) | 0), amp: 0.02 + Math.random() * 0.04, phase: Math.random() * TAU },
  ];
  const edgeAt = (angle) => {
    let m = 1;
    for (const l of lobes) m += l.amp * Math.sin(l.freq * angle + l.phase);
    return radius * m;
  };

  // Melted body: mostly dark hole (~80%) with a thin white-hot/glow rim
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const shapeEdge = edgeAt(Math.atan2(dy, dx));
      if (dist > shapeEdge + (Math.random() * 1.2 - 0.6)) continue;

      const t = dist / shapeEdge; // 0 center .. 1 edge, following the blob
      let color;
      if (t < 0.8) color = pick(MOLTEN.hole);
      else if (t < 0.9) color = pick(MOLTEN.hot);
      else if (t < 0.96) color = pick(MOLTEN.glow);
      else color = pick(MOLTEN.cool);

      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Molten drips running downward from the lower rim
  const drips = Math.random() > 0.9 ? 1 : 0;
  for (let i = 0; i < drips; i++) {
    let dx = cx + (Math.random() * 2 - 1) * radius * 0.7;
    let dy = cy + radius * 0.55;
    const len = 4 + Math.random() * (H - dy - 1);
    for (let step = 0; step < len; step++) {
      dx += (Math.random() - 0.5) * 0.5;
      dy += 1;
      const ix = Math.round(dx);
      const iy = Math.round(dy);
      if (iy >= H) break;
      if (ix < 0 || ix >= W) continue;
      const t = step / len;
      const color = t < 0.35 ? pick(MOLTEN.glow) : t < 0.7 ? pick(MOLTEN.cool) : pick(MOLTEN.coolDark);
      ctx.fillStyle = color;
      ctx.fillRect(ix, iy, 1, 1);
    }
  }

  return { dataUrl: canvas.toDataURL(), w: W * PIXEL, h: H * PIXEL, ox: 0.5, oy: (cy + 0.5) / H };
}

export function makeCrater({ style = "scorch", scale = 1 } = {}) {
  return style === "molten" ? makeMolten(scale) : makeScorch(scale);
}
