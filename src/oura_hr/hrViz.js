// Chart geometry for the oura heartrate page: turns time-ordered
// {t, value, source} samples into per-source polyline runs, axis
// ticks, and pixel mappers.

// Each metric's source order and hues are CVD-validated as a set
// against the black surface (dataviz six-checks) — change them
// together, not piecemeal. The hrv set reuses validated-adjacent
// hue pairs from the bpm set.
export const METRICS = {
  bpm: {
    unit: "bpm",
    csvColumn: "bpm",
    yFallback: [40, 160],
    yPad: 3,
    order: ["sleep", "workout", "rest", "awake", "session", "live"],
    colors: {
      sleep: "#3987e5",
      workout: "#d95926",
      rest: "#199e70",
      awake: "#c98500",
      session: "#d55181",
      live: "#9085e9",
    },
    describe: {
      sleep: "measured every few minutes while you sleep",
      workout: "recorded during a logged workout",
      rest: "daytime stillness the ring reads as restful",
      awake: "ordinary daytime readings",
      session: "app session — breathwork, meditation",
      live: "streamed by the app's live heart rate view",
    },
  },
  hrv: {
    unit: "ms",
    csvColumn: "rmssd_ms",
    yFallback: [0, 120],
    yPad: 3,
    order: ["long_sleep", "sleep", "late_nap", "rest"],
    colors: {
      long_sleep: "#3987e5",
      sleep: "#199e70",
      late_nap: "#c98500",
      rest: "#d55181",
    },
    describe: {
      long_sleep: "the main overnight sleep period",
      sleep: "confirmed nap, 15 min to 3 h",
      late_nap: "nap late enough to credit the next day",
      rest: "restful period, not scored as sleep",
    },
  },
  steps: {
    unit: "steps",
    csvColumn: "steps",
    yFallback: [0, 15000],
    yPad: 500,
    yZero: true,
    bar: true,
    order: ["steps"],
    colors: { steps: "#3987e5" },
    describe: { steps: "day's total — oura only reports steps per day" },
  },
};

// Never draw a line across more than this much silence between samples
const GAP_BREAK_MS = 20 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const X_TICK_STEPS_H = [1, 2, 3, 6, 12, 24, 48, 96, 168, 336, 720];
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
    const isDate = stepH >= 24 || (d.getHours() === 0 && d.getMinutes() === 0);
    ticks.push({
      x: toX(d.getTime()),
      label: isDate ? fmtDate(d) : fmtHour(d),
      isDate,
    });
  }
  return { ticks, stepH };
}

// Smallest of 1/2/2.5/5 x 10^k giving at most ~6 ticks over the span
function yTickStep(span) {
  const target = Math.max(0.1, span / 6);
  const pow = 10 ** Math.floor(Math.log10(target));
  for (const mult of [1, 2, 2.5, 5, 10]) {
    if (pow * mult >= target) return pow * mult;
  }
  return pow * 10;
}

const fmtTickValue = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(+v.toFixed(1)));

function buildYTicks(lo, hi, toY) {
  const step = yTickStep(hi - lo);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step / 1e6; v += step) {
    ticks.push({ y: toY(v), label: fmtTickValue(v) });
  }
  return ticks;
}

// Local midnights inside (t0, t1), for the vertical day separators
function buildDayLines(t0, t1, toX) {
  const xs = [];
  const d = new Date(t0);
  d.setHours(24, 0, 0, 0);
  for (; d.getTime() < t1; d.setDate(d.getDate() + 1)) xs.push(toX(d.getTime()));
  return xs;
}

// samples: [{t, value, source}] sorted by t, possibly empty. Returns
// everything the svg needs: runs (polylines/lone dots per source),
// ticks, mappers. The frame comes first: opts.domain pins the x extent
// and opts.yFallback scales an empty chart; data only fills what's
// there. opts: { order, domain, yFallback, yPad, yZero, gapMs }.
export function buildChart(samples, width, height, opts) {
  const pad = { top: 16, right: 14, bottom: 26, left: 40 };
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);
  const { order: sourceOrder, domain, yFallback, yPad = 3, yZero = false, bar = false } = opts;
  const gapMs = opts.gapMs ?? GAP_BREAK_MS;

  const t0 = domain ? domain[0] : samples[0].t;
  const t1 = domain ? domain[1] : samples.at(-1).t;
  const tSpan = Math.max(1, t1 - t0);

  let yLo;
  let yHi;
  if (samples.length) {
    let valLo = Infinity;
    let valHi = -Infinity;
    for (const s of samples) {
      if (s.value < valLo) valLo = s.value;
      if (s.value > valHi) valHi = s.value;
    }
    const rawLo = yZero ? 0 : Math.max(0, valLo - yPad);
    const rawHi = valHi + yPad;
    const step = yTickStep(rawHi - rawLo);
    yLo = Math.floor(rawLo / step) * step;
    yHi = Math.ceil(rawHi / step) * step;
  } else {
    [yLo, yHi] = yFallback ?? [0, 100];
  }

  const toX = (t) => pad.left + ((t - t0) / tSpan) * innerW;
  const toY = (value) => pad.top + (1 - (value - yLo) / (yHi - yLo)) * innerH;

  // Contiguous same-source stretches become polylines; breaks on source
  // change or a gap. Single-sample stretches render as dots.
  const runs = [];
  let run = null;
  for (const s of samples) {
    const prev = run?.samples.at(-1);
    if (!prev || s.source !== run.source || s.t - prev.t > gapMs) {
      run = { source: s.source, samples: [] };
      runs.push(run);
    }
    run.samples.push(s);
  }
  for (const r of runs) {
    r.points = r.samples.map((s) => `${toX(s.t).toFixed(1)},${toY(s.value).toFixed(1)}`).join(" ");
  }

  // Bar metrics (daily totals) get one column per sample instead of runs
  let bars = null;
  if (bar) {
    const dayW = ((24 * HOUR_MS) / tSpan) * innerW;
    const barW = Math.max(2, dayW * 0.55);
    bars = samples.map((s) => ({
      x: toX(s.t) - barW / 2,
      y: toY(s.value),
      w: barW,
      h: Math.max(0, toY(yLo) - toY(s.value)),
      source: s.source,
    }));
  }

  const present = new Set(samples.map((s) => s.source));
  const { ticks: xTicks, stepH } = buildXTicks(t0, t1, toX);
  return {
    pad,
    plot: { x: pad.left, y: pad.top, w: innerW, h: innerH },
    runs,
    bars,
    xTicks,
    yTicks: buildYTicks(yLo, yHi, toY),
    // past day-per-tick density, one separator per label is plenty
    dayLines: stepH >= 24 ? xTicks.map((t) => t.x) : buildDayLines(t0, t1, toX),
    sources: sourceOrder.filter((s) => present.has(s)),
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
    if (s.value < min) min = s.value;
    if (s.value > max) max = s.value;
    sum += s.value;
  }
  return { count: samples.length, min, max, avg: sum / samples.length };
}
