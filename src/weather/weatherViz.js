// Port of the terminal weather renderer (~/.zsh_weather_helper.py).
// Builds the header table and per-day hourly bar graphs as "lines",
// where each line is an array of segments: { text, color?, bold?, emojiW? }.
// Segments with emojiW render as fixed-width cells so emoji can't
// break monospace alignment.

const TEMP_GRADIENT = [
  [63, 94, 251],
  [47, 158, 255],
  [42, 200, 222],
  [85, 212, 119],
  [189, 213, 63],
  [249, 200, 45],
  [252, 148, 36],
  [247, 77, 45],
  [232, 44, 44],
];
const TEMP_GRADIENT_MIN = 10;
const TEMP_GRADIENT_MAX = 90;

const PRECIP_GRADIENT = [
  [120, 120, 120],
  [100, 180, 220],
  [70, 130, 255],
  [120, 80, 255],
  [160, 60, 255],
];

const AXIS = "rgb(100, 100, 100)";
const LABEL = "rgb(180, 180, 180)";
const DIM = "rgb(128, 128, 128)";

const TARGET_ROWS = 10;
const ROWS_PER_TICK_MIN = 2;
const HOURS = 24;
const BAR_W = 2;
const SEP_W = 2;
const SLOT_W = BAR_W + SEP_W;
const GRAPH_COLS = HOURS * SLOT_W;
const MARGIN = " ".repeat(7);
const BAR_CHAR = "*";
const GRID_DASH = "┄";
const TICK_STEP = 5;
const PRECIP_BAR_MAX = 4;

const seg = (text, opts) => ({ text, ...opts });

const mod = (n, m) => ((n % m) + m) % m;

// python-style round (half to even), so the graph geometry matches
function pyRound(x) {
  const floor = Math.floor(x);
  const frac = x - floor;
  if (frac > 0.5) return floor + 1;
  if (frac < 0.5) return floor;
  return mod(floor, 2) === 0 ? floor : floor + 1;
}

function lerpRgb(t, gradient) {
  const clamped = Math.max(0, Math.min(1, t));
  const pos = clamped * (gradient.length - 1);
  const idx = Math.min(Math.floor(pos), gradient.length - 2);
  const frac = pos - idx;
  const [r0, g0, b0] = gradient[idx];
  const [r1, g1, b1] = gradient[idx + 1];
  return [
    pyRound(r0 + (r1 - r0) * frac),
    pyRound(g0 + (g1 - g0) * frac),
    pyRound(b0 + (b1 - b0) * frac),
  ];
}

const lerpColor = (t, gradient) => `rgb(${lerpRgb(t, gradient).join(", ")})`;

export const tempColor = (temp) =>
  lerpColor(
    (temp - TEMP_GRADIENT_MIN) / (TEMP_GRADIENT_MAX - TEMP_GRADIENT_MIN),
    TEMP_GRADIENT
  );

export const precipColor = (pct) => lerpColor(pct / 100, PRECIP_GRADIENT);

// EPA AQI categories: [max, name, color]
const AQI_LEVELS = [
  [50, "Good", "rgb(0, 228, 0)"],
  [100, "Moderate", "rgb(255, 255, 0)"],
  [150, "Unhealthy for Sensitive Groups", "rgb(255, 126, 0)"],
  [200, "Unhealthy", "rgb(255, 0, 0)"],
  [300, "Very Unhealthy", "rgb(143, 63, 151)"],
  [Infinity, "Hazardous", "rgb(126, 0, 35)"],
];
const AQI_BAND_W = 8;
const AQI_TOP = 500;

// The AQI as a dot on an EPA-banded line gauge spanning totalW chars
// (e.g. the header table width); the dot sits proportionally within
// its band.
function buildAqiGaugeLines(aqi, totalW = 0) {
  const n = AQI_LEVELS.length;
  const inner = (totalW || AQI_BAND_W * n + n + 1) - (n + 1);
  const base = Math.floor(inner / n);
  const extra = inner % n;
  const widths = AQI_LEVELS.map((_, i) => (i < extra ? base + 1 : base));

  const idx = AQI_LEVELS.findIndex(([max]) => aqi <= max);
  const [, name, color] = AQI_LEVELS[idx];
  const lo = idx === 0 ? 0 : AQI_LEVELS[idx - 1][0] + 1;
  const hi = idx < n - 1 ? AQI_LEVELS[idx][0] : AQI_TOP;
  const frac = Math.max(0, Math.min(1, (aqi - lo) / (hi - lo)));
  const pos = pyRound(frac * (widths[idx] - 1));

  const dashes = widths.map((w) => "─".repeat(w));
  const mid = [seg("  "), seg("│", { color: AXIS })];
  widths.forEach((w, i) => {
    if (i === idx) {
      if (pos > 0) mid.push(seg(" ".repeat(pos)));
      mid.push(seg("*", { color }));
      if (pos < w - 1) mid.push(seg(" ".repeat(w - pos - 1)));
    } else {
      mid.push(seg(" ".repeat(w)));
    }
    mid.push(seg("│", { color: AXIS }));
  });

  return [
    [],
    [
      seg("  "),
      seg("AQI: ", { color: DIM }),
      seg(String(aqi), { color }),
      seg(` (${name})`, { color: LABEL }),
    ],
    [seg("  "), seg(`┌${dashes.join("┬")}┐`, { color: AXIS })],
    mid,
    [seg("  "), seg(`└${dashes.join("┴")}┘`, { color: AXIS })],
    [],
    [],
    [],
  ];
}

// ---------------------------------------------------------------------------
// Weather conditions -> emoji
// ---------------------------------------------------------------------------

const VS16 = "\ufe0f"; // emoji variation selector
const EMOJI_RULES = [
  [["thunder", "tstorm"], "⛈" + VS16],
  [["rain", "drizzle", "shower"], "\u{1f327}" + VS16],
  [["snow", "blizzard"], "\u{1f328}" + VS16],
  [["sleet", "ice", "freez"], "\u{1f9ca}"],
  [["fog", "mist", "haze"], "\u{1f32b}" + VS16],
];
const EMOJI_PAIRS = [
  [["partly", "cloud"], "⛅"],
  [["partly", "sunny"], "⛅"],
  [["mostly", "sunny"], "⛅"],
];
const EMOJI_SINGLES = [
  [["cloud", "overcast"], "☁" + VS16],
  [["sunny", "clear"], "☀" + VS16],
  [["wind"], "\u{1f4a8}"],
];
const EMOJI_DEFAULT = "\u{1f321}" + VS16;

export function conditionsEmoji(forecast) {
  const f = forecast.toLowerCase();
  for (const [keywords, emoji] of EMOJI_RULES) {
    if (keywords.some((k) => f.includes(k))) return emoji;
  }
  for (const [[a, b], emoji] of EMOJI_PAIRS) {
    if (f.includes(a) && f.includes(b)) return emoji;
  }
  for (const [keywords, emoji] of EMOJI_SINGLES) {
    if (keywords.some((k) => f.includes(k))) return emoji;
  }
  return EMOJI_DEFAULT;
}

// ---------------------------------------------------------------------------
// NWS hourly periods -> per-day structures
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Hours come from the raw ISO string, so they stay local to the
// forecast location rather than the viewer's timezone.
function parseDays(periods) {
  const dayOrder = [];
  const days = new Map();
  for (const p of periods) {
    const hour = parseInt(p.startTime.slice(11, 13), 10);
    const [y, m, d] = p.startTime.slice(0, 10).split("-").map(Number);
    const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    const label = `${weekday} ${m}/${String(d).padStart(2, "0")}`;
    if (!days.has(label)) {
      days.set(label, { temps: new Map(), conditions: new Map(), precip: new Map() });
      dayOrder.push(label);
    }
    const day = days.get(label);
    day.temps.set(hour, p.temperature);
    day.conditions.set(hour, p.shortForecast ?? "");
    day.precip.set(hour, p.probabilityOfPrecipitation?.value ?? 0);
  }
  return { dayOrder, days };
}

// ---------------------------------------------------------------------------
// Graph geometry
// ---------------------------------------------------------------------------

// Snap range outward to multiples of 5. If already on a 5, add an extra 5.
function snapRange(tempMin, tempMax) {
  const lo = mod(tempMin, TICK_STEP)
    ? tempMin - mod(tempMin, TICK_STEP)
    : tempMin - TICK_STEP;
  const hi = mod(tempMax, TICK_STEP)
    ? tempMax + (TICK_STEP - mod(tempMax, TICK_STEP))
    : tempMax + TICK_STEP;
  return [lo, hi];
}

function graphGeometry(tempLo, tempHi) {
  const numIntervals = (tempHi - tempLo) / TICK_STEP;
  const rowsPerInterval = Math.max(ROWS_PER_TICK_MIN, pyRound(TARGET_ROWS / numIntervals));
  const graphRows = numIntervals * rowsPerInterval;
  const ticks = new Map();
  for (let i = 0; i <= numIntervals; i++) {
    ticks.set(i * rowsPerInterval, tempLo + i * TICK_STEP);
  }
  return { graphRows, ticks };
}

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

// Center text in a field. Extra space biased left.
function center(text, width) {
  const pad = width - text.length;
  const left = Math.floor((pad + 1) / 2);
  return " ".repeat(Math.max(0, left)) + text + " ".repeat(Math.max(0, pad - left));
}

function renderRow(hourTemps, levels, row, firstHour, isTick) {
  const rowBase = row * 8;
  const dashSlot = seg(GRID_DASH.repeat(SLOT_W), { color: AXIS });
  const dashSep = seg(GRID_DASH.repeat(SEP_W), { color: AXIS });
  const parts = [];
  for (let h = 0; h < HOURS; h++) {
    if (h < firstHour || !hourTemps.has(h)) {
      parts.push(isTick ? dashSlot : seg(" ".repeat(SLOT_W)));
      continue;
    }
    const level = levels.get(h);
    if (isTick && level < rowBase) {
      parts.push(dashSlot);
    } else {
      parts.push(
        level >= rowBase
          ? seg(BAR_CHAR.repeat(BAR_W), { color: tempColor(hourTemps.get(h)) })
          : seg(" ".repeat(BAR_W)),
        isTick ? dashSep : seg(" ".repeat(SEP_W))
      );
    }
  }
  return parts;
}

// One row of per-hour cells; cellFn(h) returns the SLOT_W-wide segments.
function hourSlotRow(hourTemps, firstHour, cellFn) {
  const parts = [seg(MARGIN)];
  for (let h = 0; h < HOURS; h++) {
    if (h < firstHour || !hourTemps.has(h)) {
      parts.push(seg(" ".repeat(SLOT_W)));
    } else {
      parts.push(...cellFn(h));
    }
  }
  return parts;
}

function precipBarHeight(pct) {
  if (pct <= 0) return 0;
  return Math.min(PRECIP_BAR_MAX, Math.floor((pct + 24) / 25));
}

function yLabel(row, ticks) {
  if (ticks.has(row)) {
    return [seg(`${String(ticks.get(row)).padStart(3)}°`, { color: LABEL }), seg(" ")];
  }
  return [seg("     ")];
}

// ---------------------------------------------------------------------------
// Per-day graph
// ---------------------------------------------------------------------------

function buildDayLines(label, day, tempLo, tempHi) {
  const hourTemps = day.temps;
  const { graphRows, ticks } = graphGeometry(tempLo, tempHi);
  const tempRange = tempHi - tempLo || 1;
  const firstHour = Math.min(...hourTemps.keys());

  const loLevel = 4;
  const hiLevel = graphRows * 8 + 4;
  const levels = new Map(
    [...hourTemps].map(([h, t]) => [
      h,
      loLevel + pyRound(((t - tempLo) / tempRange) * (hiLevel - loLevel)),
    ])
  );

  const lines = [];

  // Header + hour labels
  lines.push([]);
  lines.push([seg("  "), seg(label, { color: LABEL, bold: true })]);
  lines.push(
    hourSlotRow(hourTemps, firstHour, (h) => [
      seg(center(String(h), SLOT_W), { color: DIM }),
    ])
  );

  // Graph rows (top-down)
  for (let row = graphRows; row >= 0; row--) {
    const yl = yLabel(row, ticks);
    if (row === graphRows) {
      lines.push([seg("  "), ...yl, seg(`┌${"─".repeat(GRAPH_COLS)}┐`, { color: AXIS })]);
    } else if (row === 0) {
      lines.push([seg("  "), ...yl, seg(`└${"─".repeat(GRAPH_COLS)}┘`, { color: AXIS })]);
    } else {
      lines.push([
        seg("  "),
        ...yl,
        seg("│", { color: AXIS }),
        ...renderRow(hourTemps, levels, row, firstHour, ticks.has(row)),
        seg("│", { color: AXIS }),
      ]);
    }
  }

  // Labels: temp, emoji, precip
  lines.push(
    hourSlotRow(hourTemps, firstHour, (h) => [
      seg(center(String(hourTemps.get(h)), SLOT_W), { color: tempColor(hourTemps.get(h)) }),
    ])
  );
  lines.push(
    hourSlotRow(hourTemps, firstHour, (h) => {
      const cond = day.conditions.get(h) ?? "";
      return [seg(conditionsEmoji(cond), { emojiW: SLOT_W, tip: cond || undefined })];
    })
  );
  lines.push(
    hourSlotRow(hourTemps, firstHour, (h) => {
      const pct = day.precip.get(h) ?? 0;
      return [seg(center(`${pct}%`, SLOT_W), { color: precipColor(pct) })];
    })
  );

  // Precip stalactite bars
  for (let barRow = 0; barRow < PRECIP_BAR_MAX; barRow++) {
    lines.push(
      hourSlotRow(hourTemps, firstHour, (h) => {
        const pct = day.precip.get(h) ?? 0;
        return barRow < precipBarHeight(pct)
          ? [seg(center(BAR_CHAR.repeat(BAR_W), SLOT_W), { color: precipColor(pct) })]
          : [seg(" ".repeat(SLOT_W))];
      })
    );
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Header table
// ---------------------------------------------------------------------------

const visWidth = (segs) =>
  segs.reduce((n, s) => n + (s.emojiW ?? s.text.length), 0);

function buildTableLines(rows) {
  const col0W = Math.max(...rows.map(([label]) => label.length));
  const col1W = Math.max(...rows.map(([, value]) => visWidth(value)));

  const hline = (left, midChar, right) => [
    seg("  "),
    seg(
      `${left}${"─".repeat(col0W + 2)}${midChar}${"─".repeat(col1W + 2)}${right}`,
      { color: AXIS }
    ),
  ];

  const lines = [hline("┌", "┬", "┐")];
  rows.forEach(([label, value], i) => {
    const pad = Math.max(0, col1W - visWidth(value));
    lines.push([
      seg("  "),
      seg("│", { color: AXIS }),
      seg(` ${label.padStart(col0W)} `, { color: DIM }),
      seg("│", { color: AXIS }),
      seg(" "),
      ...value,
      seg(`${" ".repeat(pad)} `),
      seg("│", { color: AXIS }),
    ]);
    if (i < rows.length - 1) lines.push(hline("├", "┼", "┤"));
  });
  lines.push(hline("└", "┴", "┘"));
  return { lines, width: col0W + col1W + 7 };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function buildWeatherLines(report, numDays = 1) {
  const { dayOrder, days } = parseDays(report.periods);
  const shownDays = dayOrder.slice(0, numDays);
  const allTemps = shownDays.flatMap((label) => [...days.get(label).temps.values()]);
  if (!allTemps.length) return [];
  const [tempLo, tempHi] = snapRange(Math.min(...allTemps), Math.max(...allTemps));

  const { location, coords, current } = report;
  const tableRows = [
    ["Location", [seg(location, { color: LABEL, bold: true })]],
    ["Coords", [seg(coords, { color: DIM })]],
    ["Temp", [seg(`${current.temp}°F`, { color: tempColor(current.temp) })]],
    [
      "Conditions",
      [seg(conditionsEmoji(current.cond), { emojiW: 2 }), seg(` ${current.cond}`, { color: LABEL })],
    ],
    ["Precip. Chance", [seg(`${current.precip}%`, { color: precipColor(current.precip) })]],
  ];

  const table = buildTableLines(tableRows);
  const lines = [[], ...table.lines];
  if (report.aqi != null) lines.push(...buildAqiGaugeLines(report.aqi, table.width));
  for (const label of shownDays) {
    lines.push(...buildDayLines(label, days.get(label), tempLo, tempHi));
  }
  return lines;
}
