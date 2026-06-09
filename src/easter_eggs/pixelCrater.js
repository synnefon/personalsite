// Procedural pixel-art impact decals.
//
// Every gun (bullets and laser alike) produces a crater *descriptor* — a shape,
// not a baked image — and the caller paints all live craters onto one shared
// canvas via renderCraters. They merge there:
//
//   1. All dark centers are drawn first, so they combine into one cavity and a
//      newer hole CONSUMES any border it lands on (the border becomes void).
//   2. Borders are drawn second, and only where no border exists yet, so the
//      combined shape gets a single clean outline instead of stacked rims.
//
// Laser holes additionally glow; the glow is a separate smooth layer painted by
// renderMoltenGlow and faded out over time by the caller.
//
// Scaling keeps the on-screen PIXEL size constant and changes the grid
// dimensions instead — bigger craters use *more* pixels, not bigger ones.

export const PIXEL = 5; // css px per crater pixel — constant across all sizes
const SCORCH_GRID = 15; // base grid cells at scale 1
const MOLTEN_W = 16;
const TAU = Math.PI * 2;

const SCORCH = {
  void: "#080808",
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
  hole: ["#1c0a04", "#120703", "#230d05"],
  hot: ["#fff3c4", "#ffe28a", "#ffd23f"],
  glow: ["#ff9a1f", "#ff7a00", "#ff5e00"],
  cool: ["#cf3a0c", "#9e2407", "#7a1804"],
  coolDark: ["#3d0f04", "#250803"],
};

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// Deterministic [0,1) hash of a cell. The shared canvas is redrawn on every
// shot, so the interior colors and ragged edges must be a stable function of
// position — otherwise they would shimmer between redraws.
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
        c: Math.random() < 0.3 ? pick(SCORCH.rim) : SCORCH.void,
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

// --- Shared rendering ------------------------------------------------------

// Normalized distance of a cell from a crater: <darkFrac is the dark void,
// [darkFrac, 1) is the rim, >=1 is outside. Includes a stable ragged-edge
// jitter so redraws don't shimmer. Craters carry cx/cy in cell coords.
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

function darkColor(crater, gx, gy) {
  return crater.type === "molten"
    ? pickStable(MOLTEN.hole, gx, gy, 0)
    : SCORCH.void;
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

// True when a point (in cell coords) sits inside the black void of any hole.
// Shots landing here pass through the existing hole and leave no new decal.
export function isInMoltenVoid(holes, gx, gy) {
  for (const h of holes) {
    const dx = gx - h.cx;
    const dy = gy - h.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < moltenEdgeAt(h, Math.atan2(dy, dx)) * MOLTEN_DARK) return true;
  }
  return false;
}

// Per-cell accumulators, reused across redraws:
//   cov     — how many crater disks cover the cell (saturated at 2)
//   bestM   — smallest normalized distance over those craters
//   bestIdx — which crater achieved bestM (its palette colors the cell)
let cov = null;
let bestM = null;
let bestIdx = null;
function getFields(n) {
  if (!cov || cov.length < n) {
    cov = new Uint8Array(n);
    bestM = new Float32Array(n);
    bestIdx = new Int32Array(n);
  }
  cov.fill(0, 0, n);
  bestM.fill(2, 0, n);
  bestIdx.fill(-1, 0, n);
}

// Paint every live crater onto one canvas (cols x rows cells). Craters merge:
// a cell covered by two or more crater disks is inside the combined cavity and
// is always dark — a rim is NEVER drawn around an already-placed center. Only
// cells covered by a single crater show that crater's own dark/rim bands, so
// rims trace just the outer silhouette of the merged shape.
export function renderCraters(ctx, craters, cols, rows) {
  ctx.clearRect(0, 0, cols, rows);
  if (craters.length === 0) return;

  const boxes = craters.map((c) => {
    const m = Math.ceil(c.reach) + 2;
    return {
      x0: Math.max(0, Math.floor(c.cx - m)),
      x1: Math.min(cols - 1, Math.ceil(c.cx + m)),
      y0: Math.max(0, Math.floor(c.cy - m)),
      y1: Math.min(rows - 1, Math.ceil(c.cy + m)),
    };
  });
  getFields(cols * rows);

  // Accumulate coverage and the nearest crater per cell.
  let ux0 = cols, ux1 = -1, uy0 = rows, uy1 = -1;
  for (let k = 0; k < craters.length; k++) {
    const c = craters[k];
    const b = boxes[k];
    if (b.x0 < ux0) ux0 = b.x0;
    if (b.x1 > ux1) ux1 = b.x1;
    if (b.y0 < uy0) uy0 = b.y0;
    if (b.y1 > uy1) uy1 = b.y1;
    for (let gy = b.y0; gy <= b.y1; gy++) {
      for (let gx = b.x0; gx <= b.x1; gx++) {
        const m = normDist(c, gx, gy);
        if (m >= 1) continue;
        const idx = gy * cols + gx;
        if (cov[idx] < 2) cov[idx]++;
        if (m < bestM[idx]) {
          bestM[idx] = m;
          bestIdx[idx] = k;
        }
      }
    }
  }

  // Paint: overlaps and dark zones are dark; single-coverage rim cells get the
  // nearest crater's rim band.
  for (let gy = uy0; gy <= uy1; gy++) {
    for (let gx = ux0; gx <= ux1; gx++) {
      const idx = gy * cols + gx;
      const k = bestIdx[idx];
      if (k < 0) continue;
      const c = craters[k];
      const m = bestM[idx];
      ctx.fillStyle =
        cov[idx] >= 2 || m < c.darkFrac
          ? darkColor(c, gx, gy)
          : rimColor(c, m, gx, gy);
      ctx.fillRect(gx, gy, 1, 1);
    }
  }

  // Extras (cracks/drips) on top, in each crater's local space — but only on
  // bare page or this crater's own single-coverage surface, so they never mark
  // a merged cavity or another crater's territory.
  for (let k = 0; k < craters.length; k++) {
    const c = craters[k];
    for (const p of c.extras) {
      const gx = Math.round(c.cx + p.dx);
      const gy = Math.round(c.cy + p.dy);
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
      const idx = gy * cols + gx;
      if (cov[idx] !== 0 && !(cov[idx] === 1 && bestIdx[idx] === k)) continue;
      ctx.fillStyle = p.c;
      ctx.fillRect(gx, gy, 1, 1);
    }
  }
}

// Smooth orange bloom around each laser hole, in css px. Each hole's glow fades
// linearly from birth over its glowMs; returns true while any glow is still
// visible so the caller can keep animating. Glows blend additively.
export function renderMoltenGlow(ctx, craters, w, h, now) {
  ctx.clearRect(0, 0, w, h);
  let active = false;
  ctx.globalCompositeOperation = "lighter";
  for (const c of craters) {
    if (c.type !== "molten") continue;
    const t = (now - c.bornAt) / c.glowMs;
    if (t >= 1) continue;
    active = true;
    const alpha = 1 - t;
    const R = c.r * PIXEL * 2.1;
    const g = ctx.createRadialGradient(c.x, c.y, R * 0.12, c.x, c.y, R);
    g.addColorStop(0, `rgba(255, 150, 40, ${0.5 * alpha})`);
    g.addColorStop(0.5, `rgba(255, 110, 0, ${0.26 * alpha})`);
    g.addColorStop(1, "rgba(255, 90, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(c.x - R, c.y - R, R * 2, R * 2);
  }
  ctx.globalCompositeOperation = "source-over";
  return active;
}
