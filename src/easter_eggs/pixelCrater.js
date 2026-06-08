// Draws a procedural pixel-art blast crater onto a transparent low-res canvas
// and returns a data URL plus the display size. Each call is unique.

const GRID = 15; // crater is GRID x GRID source pixels
const PIXEL = 5; // base css px per source pixel
const BASE_SIZE = GRID * PIXEL;

const VOID = "#080808";
const RIM = ["#161210", "#241a14", "#322318", "#1d160f"];
const EMBER = ["#6e2f12", "#8a3b14", "#a85a1e"];

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function makeCrater() {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d");

  const c = (GRID - 1) / 2;
  const radius = c * (0.7 + Math.random() * 0.25);

  // Scorched body with a jagged edge and dark void center
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const dist = Math.hypot(x - c, y - c);
      const edge = radius + (Math.random() * 1.6 - 0.8);
      if (dist > edge) continue;

      let color;
      if (dist < radius * 0.4) color = VOID;
      else if (dist < radius * 0.7) color = pick(RIM);
      else color = Math.random() < 0.22 ? pick(EMBER) : pick(RIM);

      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // A few jagged cracks wandering outward from the center
  const cracks = 2 + ((Math.random() * 3) | 0);
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
      if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) break;
      ctx.fillStyle = Math.random() < 0.3 ? pick(RIM) : VOID;
      ctx.fillRect(ix, iy, 1, 1);
      angle += (Math.random() - 0.5) * 0.8;
    }
  }

  const size = Math.round(BASE_SIZE * (0.75 + Math.random() * 0.6));
  return { dataUrl: canvas.toDataURL(), size };
}
