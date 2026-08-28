// Chart geometry for the oura heartrate page: turns time-ordered bpm
// samples into per-source polyline runs, axis ticks, and pixel mappers.

// Source order and hues are CVD-validated as a set against the black
// surface (dataviz six-checks) — change them together, not piecemeal.
export const SOURCE_ORDER = ["sleep", "workout", "rest", "awake", "session", "live"];
export const SOURCE_COLORS = {
  sleep: "#3987e5",
  workout: "#d95926",
  rest: "#199e70",
  awake: "#c98500",
  session: "#d55181",
  live: "#008300",
};

// Never draw a line across more than this much silence between samples
const GAP_BREAK_MS = 20 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const X_TICK_STEPS_H = [1, 2, 3, 6, 12, 24, 48, 96, 168, 336, 720];
const Y_TICK_STEPS = [5, 10, 20, 25, 50];
const MAX_TICKS = 8;

const fmtDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const fmtHour = (d) => {
  if (d.getHours() === 0 && d.getMinutes() === 0) return fmtDate(d);
  const h = d.getHours() % 12 || 12;
  return `${h}${d.getHours() < 12 ? "am" : "pm"}`;
};

export const fmtTime = (t) => {
  const d = new Date(t);
  const h = d.getHours() % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDate(d)} ${h}:${min}${d.getHours() < 12 ? "am" : "pm"}`;
};

// Calendar-stepped ticks (DST-safe): local midnights for day steps,
// local hour multiples for sub-day steps
function buildXTicks(t0, t1, toX) {
  const spanH = (t1 - t0) / HOUR_MS;
  const stepH = X_TICK_STEPS_H.find((s) => spanH / s <= MAX_TICKS) ?? X_TICK_STEPS_H.at(-1);
  const first = new Date(t0);
  first.setMinutes(0, 0, 0);
  if (stepH >= 24) first.setHours(0);
  else first.setHours(Math.ceil(first.getHours() / stepH) * stepH);
  while (first.getTime() < t0) first.setHours(first.getHours() + stepH);

  const ticks = [];
  for (const d = first; d.getTime() <= t1; d.setHours(d.getHours() + stepH)) {
    ticks.push({
      x: toX(d.getTime()),
      label: stepH >= 24 ? fmtDate(d) : fmtHour(d),
    });
  }
  return ticks;
}

function buildYTicks(lo, hi, toY) {
  const step = Y_TICK_STEPS.find((s) => (hi - lo) / s <= 6) ?? Y_TICK_STEPS.at(-1);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    ticks.push({ y: toY(v), label: String(v) });
  }
  return ticks;
}

// samples: [{t, bpm, source}] sorted by t. Returns everything the svg
// needs: runs (polylines/lone dots per source), ticks, mappers, extents.
export function buildChart(samples, width, height) {
  const pad = { top: 12, right: 14, bottom: 26, left: 40 };
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);

  const t0 = samples[0].t;
  const t1 = samples.at(-1).t;
  const tSpan = Math.max(1, t1 - t0);

  let bpmLo = Infinity;
  let bpmHi = -Infinity;
  for (const s of samples) {
    if (s.bpm < bpmLo) bpmLo = s.bpm;
    if (s.bpm > bpmHi) bpmHi = s.bpm;
  }
  const yLo = Math.max(0, Math.floor((bpmLo - 3) / 10) * 10);
  const yHi = Math.ceil((bpmHi + 3) / 10) * 10;

  const toX = (t) => pad.left + ((t - t0) / tSpan) * innerW;
  const toY = (bpm) => pad.top + (1 - (bpm - yLo) / (yHi - yLo)) * innerH;

  // Contiguous same-source stretches become polylines; breaks on source
  // change or a gap. Single-sample stretches render as dots.
  const runs = [];
  let run = null;
  for (const s of samples) {
    const prev = run?.samples.at(-1);
    if (!prev || s.source !== run.source || s.t - prev.t > GAP_BREAK_MS) {
      run = { source: s.source, samples: [] };
      runs.push(run);
    }
    run.samples.push(s);
  }
  for (const r of runs) {
    r.points = r.samples.map((s) => `${toX(s.t).toFixed(1)},${toY(s.bpm).toFixed(1)}`).join(" ");
  }

  const present = new Set(samples.map((s) => s.source));
  return {
    pad,
    plot: { x: pad.left, y: pad.top, w: innerW, h: innerH },
    runs,
    xTicks: buildXTicks(t0, t1, toX),
    yTicks: buildYTicks(yLo, yHi, toY),
    sources: SOURCE_ORDER.filter((s) => present.has(s)),
    toX,
    toY,
    xToT: (x) => t0 + ((x - pad.left) / innerW) * tSpan,
  };
}

// Index of the sample nearest in time; samples must be sorted by t
export function nearestIndex(samples, t) {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && t - samples[lo - 1].t < samples[lo].t - t) return lo - 1;
  return lo;
}

export function buildStats(samples) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const s of samples) {
    if (s.bpm < min) min = s.bpm;
    if (s.bpm > max) max = s.bpm;
    sum += s.bpm;
  }
  return { count: samples.length, min, max, avg: Math.round(sum / samples.length) };
}
