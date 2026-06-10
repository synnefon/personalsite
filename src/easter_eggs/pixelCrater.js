// Procedural pixel-art impact decals.
//
// Every gun (bullets and laser alike) produces a crater *descriptor* — a shape,
// not a baked image — and the caller bakes it into a persistent surface via
// stampCrater, then throws the descriptor away. Nothing is kept per hole, so
// holes never expire and any number of them costs the same. Merging happens at
// bake time:
//
//   1. A cell already covered by an earlier hole always goes dark, so a newer
//      hole CONSUMES any rim it lands on and overlapping holes weld into one
//      cavity.
//   2. Rims are painted only on previously-bare cells, so the combined shape
//      gets a single clean outline instead of stacked rims.
//
// Every hole interior is the same dark void color; the laser look comes from
// its molten rim plus a transient glow layer (renderGlows) faded out over time
// by the caller.
//
// Scaling keeps the on-screen PIXEL size constant and changes the grid
// dimensions instead — bigger craters use *more* pixels, not bigger ones.

export const PIXEL = 5; // css px per crater pixel — constant across all sizes
const SCORCH_GRID = 15; // base grid cells at scale 1
const MOLTEN_W = 16;
const TAU = Math.PI * 2;

const VOID = "#080808"; // interior of every hole, regardless of gun

const SCORCH = {
  rim: ["#161210", "#241a14", "#322318", "#1d160f"],
  hot: ["#6e2f12", "#8a3b14", "#a85a1e"],
  hotChance: 0.22,
  crackRange: [2, 4],
};

// Dark-void fraction (of normalized radius) per crater type — below this a cell
// is the dark hole, above it (up to 1) it's the rim. SCORCH_RIM splits the
// scorch rim into inner char and outer ember.
const SCORCH_DARK = 0.64;
const SCORCH_RIM = 0.85;
const MOLTEN_DARK = 0.8;

// Molten metal heat gradient, hottest at the melted edge
const MOLTEN = {
  hot: ["#fff3c4", "#ffe28a", "#ffd23f"],
  glow: ["#ff9a1f", "#ff7a00", "#ff5e00"],
  cool: ["#cf3a0c", "#9e2407", "#7a1804"],
  coolDark: ["#3d0f04", "#250803"],
};

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// Deterministic [0,1) hash of a cell — stable per-position color and edge
// variation, independent of stamp order.
function cellNoise(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const pickStable = (arr, x, y, salt) =>
  arr[(cellNoise(x, y, salt) * arr.length) | 0];

// Random size multiplier, applied to the cell COUNT (not the pixel size)
function gridMul(scale) {
  return scale * (0.78 + Math.random() * 0.5);
}

// Baked dark crack pixels (cell offsets from center) radiating outward.
function makeCracks(radius, c) {
  const [lo, hi] = SCORCH.crackRange;
  const count = lo + ((Math.random() * (hi - lo + 1)) | 0);
  const pixels = [];
  for (let i = 0; i < count; i++) {
    let angle = Math.random() * TAU;
    let px = 0;
    let py = 0;
    const len = radius + 1 + Math.random() * c;
    for (let step = 0; step < len; step++) {
      px += Math.cos(angle);
      py += Math.sin(angle);
      pixels.push({
        dx: Math.round(px),
        dy: Math.round(py),
        c: Math.random() < 0.3 ? pick(SCORCH.rim) : VOID,
      });
      angle += (Math.random() - 0.5) * 0.8;
    }
  }
  return pixels;
}

export function createScorchCrater(scale) {
  const G = Math.max(7, Math.round(SCORCH_GRID * gridMul(scale)));
  const c = (G - 1) / 2;
  const radius = c * (0.7 + Math.random() * 0.25);
  return {
    type: "scorch",
    radius,
    reach: radius + 1,
    darkFrac: SCORCH_DARK,
    extras: makeCracks(radius, c),
  };
}

// --- Molten holes (laser) --------------------------------------------------

// Blob edge radius (in cells) at a given angle, from the hole's lobe harmonics.
function moltenEdgeAt(hole, angle) {
  let m = 1;
  for (const l of hole.lobes) m += l.amp * Math.sin(l.freq * angle + l.phase);
  return hole.r * m;
}

// Baked drip pixels (cell offsets from center) running downward.
function makeDrips(r, lobes) {
  const dripRand = Math.random();
  const count =
    dripRand > 0.99 ? 3 : dripRand > 0.95 ? 2 : dripRand > 0.8 ? 1 : 0;

  const pixels = [];
  for (let i = 0; i < count; i++) {
    const ang = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    const e = moltenEdgeAt({ r, lobes }, ang);
    let dx = Math.cos(ang) * e;
    let dy = Math.sin(ang) * e;
    const len = 3 + Math.random() * Math.max(2, r * 0.9);
    for (let step = 0; step < len; step++) {
      dx += (Math.random() - 0.5) * 0.5;
      dy += 1;
      const t = step / len;
      const c =
        t < 0.35
          ? pick(MOLTEN.glow)
          : t < 0.7
            ? pick(MOLTEN.cool)
            : pick(MOLTEN.coolDark);
      pixels.push({ dx, dy, c });
    }
  }
  return pixels;
}

export function createMoltenHole(scale) {
  const W = Math.max(8, Math.round(MOLTEN_W * gridMul(scale)));
  const cxCells = (W - 1) / 2;
  const r = cxCells * (0.55 + Math.random() * 0.15);
  const lobes = [
    {
      freq: 2 + ((Math.random() * 2) | 0),
      amp: 0.08 + Math.random() * 0.08,
      phase: Math.random() * TAU,
    },
    {
      freq: 3 + ((Math.random() * 3) | 0),
      amp: 0.04 + Math.random() * 0.05,
      phase: Math.random() * TAU,
    },
    {
      freq: 6 + ((Math.random() * 4) | 0),
      amp: 0.02 + Math.random() * 0.04,
      phase: Math.random() * TAU,
    },
  ];
  return {
    type: "molten",
    r,
    reach: r * 1.4,
    darkFrac: MOLTEN_DARK,
    lobes,
    extras: makeDrips(r, lobes),
  };
}

// --- Persistent surface ------------------------------------------------------

// Normalized distance of a cell from a crater: <darkFrac is the dark void,
// [darkFrac, 1) is the rim, >=1 is outside. Includes a stable ragged-edge
// jitter. Craters carry cx/cy in cell coords.
function normDist(crater, gx, gy) {
  const dx = gx - crater.cx;
  const dy = gy - crater.cy;
  const dist = Math.hypot(dx, dy);
  if (crater.type === "molten") {
    const e = moltenEdgeAt(crater, Math.atan2(dy, dx));
    return dist / e + (cellNoise(gx, gy, 7) - 0.5) * 0.1;
  }
  const edge = crater.radius + (cellNoise(gx, gy, 5) - 0.5) * 1.6;
  return dist / edge;
}

// Rim color for a cell at normalized distance m (darkFrac <= m < 1), hotter
// toward the melted/charred edge.
function rimColor(crater, m, gx, gy) {
  if (crater.type === "molten") {
    if (m < 0.9) return pickStable(MOLTEN.hot, gx, gy, 1);
    if (m < 0.96) return pickStable(MOLTEN.glow, gx, gy, 2);
    return pickStable(MOLTEN.cool, gx, gy, 3);
  }
  if (m < SCORCH_RIM) return pickStable(SCORCH.rim, gx, gy, 1);
  return cellNoise(gx, gy, 2) < SCORCH.hotChance
    ? pickStable(SCORCH.hot, gx, gy, 3)
    : pickStable(SCORCH.rim, gx, gy, 1);
}

// The surface holes are baked into. Per-cell fields:
//   covered — cell is inside some hole's disk (dark or rim)
//   dark    — cell is painted the dark void color
// The offscreen canvas is the pixel source of truth; the caller blits it onto
// the visible canvas. The surface only ever grows, so holes outside a shrunken
// viewport survive a later re-expand.
export function createSurface() {
  const canvas = document.createElement("canvas");
  return {
    cols: 0,
    rows: 0,
    covered: new Uint8Array(0),
    dark: new Uint8Array(0),
    canvas,
    ctx: canvas.getContext("2d"),
  };
}

// Grow the surface to at least cols x rows, preserving baked content.
export function growSurface(s, cols, rows) {
  const w = Math.max(s.cols, cols);
  const h = Math.max(s.rows, rows);
  if (w === s.cols && h === s.rows) return;
  const covered = new Uint8Array(w * h);
  const dark = new Uint8Array(w * h);
  for (let gy = 0; gy < s.rows; gy++) {
    covered.set(s.covered.subarray(gy * s.cols, (gy + 1) * s.cols), gy * w);
    dark.set(s.dark.subarray(gy * s.cols, (gy + 1) * s.cols), gy * w);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (s.cols > 0 && s.rows > 0) ctx.drawImage(s.canvas, 0, 0);
  Object.assign(s, { cols: w, rows: h, covered, dark, canvas, ctx });
}

// Bake one crater (cx/cy in cell coords) into the surface, combining it with
// whatever is already there: covered cells go dark, bare cells get this
// crater's own dark/rim bands, so rims trace just the outer silhouette of the
// merged shape. The descriptor is not retained.
export function stampCrater(s, crater) {
  const margin = Math.ceil(crater.reach) + 2;
  const x0 = Math.max(0, Math.floor(crater.cx - margin));
  const x1 = Math.min(s.cols - 1, Math.ceil(crater.cx + margin));
  const y0 = Math.max(0, Math.floor(crater.cy - margin));
  const y1 = Math.min(s.rows - 1, Math.ceil(crater.cy + margin));

  // Extras (cracks/drips) are eligible only where the page was bare before this
  // stamp, but paint after the body so they sit on top of it.
  const extras = [];
  for (const p of crater.extras) {
    const gx = Math.round(crater.cx + p.dx);
    const gy = Math.round(crater.cy + p.dy);
    if (gx < 0 || gy < 0 || gx >= s.cols || gy >= s.rows) continue;
    if (!s.covered[gy * s.cols + gx]) extras.push({ gx, gy, c: p.c });
  }

  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const m = normDist(crater, gx, gy);
      if (m >= 1) continue;
      const idx = gy * s.cols + gx;
      const isDark = s.covered[idx] === 1 || m < crater.darkFrac;
      s.covered[idx] = 1;
      if (isDark) s.dark[idx] = 1;
      s.ctx.fillStyle = isDark ? VOID : rimColor(crater, m, gx, gy);
      s.ctx.fillRect(gx, gy, 1, 1);
    }
  }

  for (const p of extras) {
    s.ctx.fillStyle = p.c;
    s.ctx.fillRect(p.gx, p.gy, 1, 1);
  }
}

// True when a css-px point sits inside the black void of any baked hole.
// Shots landing here pass through the existing hole and leave no new decal.
export function isInVoid(s, x, y) {
  const gx = Math.floor(x / PIXEL);
  const gy = Math.floor(y / PIXEL);
  if (gx < 0 || gy < 0 || gx >= s.cols || gy >= s.rows) return false;
  return s.dark[gy * s.cols + gx] === 1;
}

// Smooth orange bloom around each fresh laser hole, in css px. Each glow fades
// linearly from birth over its glowMs; returns true while any glow is still
// visible so the caller can keep animating. Glows blend additively.
export function renderGlows(ctx, glows, w, h, now) {
  ctx.clearRect(0, 0, w, h);
  let active = false;
  ctx.globalCompositeOperation = "lighter";
  for (const g of glows) {
    const t = (now - g.bornAt) / g.glowMs;
    if (t >= 1) continue;
    active = true;
    const alpha = 1 - t;
    const R = g.r * PIXEL * 2.1;
    const grad = ctx.createRadialGradient(g.x, g.y, R * 0.12, g.x, g.y, R);
    grad.addColorStop(0, `rgba(255, 150, 40, ${0.5 * alpha})`);
    grad.addColorStop(0.5, `rgba(255, 110, 0, ${0.26 * alpha})`);
    grad.addColorStop(1, "rgba(255, 90, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(g.x - R, g.y - R, R * 2, R * 2);
  }
  ctx.globalCompositeOperation = "source-over";
  return active;
}
