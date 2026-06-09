// Procedural pixel-art impact decals.
//
// Scorch craters (bullets) are baked to standalone data-URL images — each one is
// an independent decal. Molten craters (laser) work differently: their dark
// holes must MERGE when they overlap, so they are never baked individually.
// Instead a laser shot produces a hole *descriptor* (createMoltenHole) and the
// caller paints every live hole onto one shared canvas (renderMoltenHoles),
// where overlapping holes fuse into a single cavity.
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

// Molten metal heat gradient, hottest at the melted edge
const MOLTEN = {
  hole: ["#1c0a04", "#120703", "#230d05"],
  hot: ["#fff3c4", "#ffe28a", "#ffd23f"],
  glow: ["#ff9a1f", "#ff7a00", "#ff5e00"],
  cool: ["#cf3a0c", "#9e2407", "#7a1804"],
  coolDark: ["#3d0f04", "#250803"],
};

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// Deterministic [0,1) hash of a cell. The molten field is redrawn on every shot,
// so its interior colors and ragged edge must be a stable function of position —
// otherwise they would shimmer between redraws.
function cellNoise(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const pickStable = (arr, x, y, salt) =>
  arr[(cellNoise(x, y, salt) * arr.length) | 0];

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

export function makeScorchCrater(scale) {
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
      else
        color =
          Math.random() < SCORCH.hotChance
            ? pick(SCORCH.hot)
            : pick(SCORCH.rim);

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

  return {
    dataUrl: canvas.toDataURL(),
    w: G * PIXEL,
    h: G * PIXEL,
    ox: 0.5,
    oy: 0.5,
  };
}

// --- Molten holes (laser) --------------------------------------------------

// Blob edge radius (in cells) at a given angle, from the hole's lobe harmonics.
function moltenEdgeAt(hole, angle) {
  let m = 1;
  for (const l of hole.lobes) m += l.amp * Math.sin(l.freq * angle + l.phase);
  return hole.r * m;
}

// Baked drip pixels (cell offsets from the hole center) running downward. Baked
// once at creation so they don't reshuffle when the field is redrawn.
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

// A laser hole's shape, independent of where it lands. The caller pins it to the
// click point and renders it (merged with its neighbors) via renderMoltenHoles.
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
  return { r, lobes, drips: makeDrips(r, lobes) };
}

// True when a point (in cell coords) sits inside the black void of any hole.
// Shots landing here pass through the existing hole and leave no new decal.
export function isInMoltenVoid(holes, gx, gy) {
  for (const h of holes) {
    const dx = gx - h.cx;
    const dy = gy - h.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < moltenEdgeAt(h, Math.atan2(dy, dx)) * 0.8) return true;
  }
  return false;
}

// Paint every live hole onto one canvas (cols x rows cells). Overlapping holes
// merge: each cell takes the SMALLEST normalized distance across all holes, so
// the hot rim only survives on the outer boundary of the combined silhouette —
// interiors fuse into one dark cavity. Holes carry cx/cy in cell coords.
export function renderMoltenHoles(ctx, holes, cols, rows) {
  ctx.clearRect(0, 0, cols, rows);
  if (holes.length === 0) return;

  // Per-hole cell bbox (margin covers the lobe bulge plus edge jitter) so each
  // cell only tests the few holes that could possibly reach it.
  const boxes = holes.map((h) => {
    const margin = Math.ceil(h.r * 1.35) + 2;
    return {
      x0: Math.max(0, Math.floor(h.cx - margin)),
      x1: Math.min(cols - 1, Math.ceil(h.cx + margin)),
      y0: Math.max(0, Math.floor(h.cy - margin)),
      y1: Math.min(rows - 1, Math.ceil(h.cy + margin)),
    };
  });
  const ux0 = Math.min(...boxes.map((b) => b.x0));
  const ux1 = Math.max(...boxes.map((b) => b.x1));
  const uy0 = Math.min(...boxes.map((b) => b.y0));
  const uy1 = Math.max(...boxes.map((b) => b.y1));

  for (let gy = uy0; gy <= uy1; gy++) {
    for (let gx = ux0; gx <= ux1; gx++) {
      let m = Infinity;
      for (let i = 0; i < holes.length; i++) {
        const b = boxes[i];
        if (gx < b.x0 || gx > b.x1 || gy < b.y0 || gy > b.y1) continue;
        const h = holes[i];
        const dx = gx - h.cx;
        const dy = gy - h.cy;
        const d = Math.hypot(dx, dy) / moltenEdgeAt(h, Math.atan2(dy, dx));
        if (d < m) m = d;
      }
      if (m === Infinity) continue;
      m += (cellNoise(gx, gy, 7) - 0.5) * 0.1; // ragged but stable edge
      if (m >= 1) continue;

      let color;
      if (m < 0.8) color = pickStable(MOLTEN.hole, gx, gy, 0);
      else if (m < 0.9) color = pickStable(MOLTEN.hot, gx, gy, 1);
      else if (m < 0.96) color = pickStable(MOLTEN.glow, gx, gy, 2);
      else color = pickStable(MOLTEN.cool, gx, gy, 3);

      ctx.fillStyle = color;
      ctx.fillRect(gx, gy, 1, 1);
    }
  }

  // Drips on top, in each hole's local space.
  for (const h of holes) {
    for (const p of h.drips) {
      const gx = Math.round(h.cx + p.dx);
      const gy = Math.round(h.cy + p.dy);
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
      ctx.fillStyle = p.c;
      ctx.fillRect(gx, gy, 1, 1);
    }
  }
}
