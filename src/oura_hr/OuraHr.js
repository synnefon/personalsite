import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/ourahr.css";
import {
  DEFAULT_PROXY,
  beginLogin,
  clearAuth,
  fetchHeartrate,
  fetchHrv,
  fetchSteps,
  fetchStress,
  getClientId,
  getProxyBase,
  getStoredAuth,
  setClientId,
  setProxyBase,
  storeToken,
  takeAuthError,
  toCsv,
} from "./ouraApi";
import { METRICS, buildChart, buildStats, fmtTime, nearestIndex } from "./hrViz";

const MIN_ZOOM_DRAG_PX = 8;

// Tall enough to read, capped so the filter row stays in view
const chartHeight = () => Math.min(560, Math.max(320, Math.round(window.innerHeight * 0.55)));

const PRESETS = [
  { label: "1d", hours: 24 },
  { label: "3d", days: 3 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

function toDayStr(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Day presets show whole calendar days (domain null = derive from the
// day bounds); hour presets show a rolling window ending now
function rangeForPreset({ hours, days }) {
  if (hours) {
    const now = Date.now();
    const from = now - hours * 3_600_000;
    return { start: toDayStr(new Date(from)), end: toDayStr(new Date(now)), domain: [from, now] };
  }
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { start: toDayStr(start), end: toDayStr(end), domain: null };
}

function dayBoundsMs(startDay, endDay) {
  const [y0, m0, d0] = startDay.split("-").map(Number);
  const [y1, m1, d1] = endDay.split("-").map(Number);
  return [new Date(y0, m0 - 1, d0).getTime(), new Date(y1, m1 - 1, d1 + 1).getTime() - 1];
}

function download(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const prettySource = (source) => source.replace(/_/g, " ");

// ============================================
// CHART
// ============================================

function HrChart({ samples, metric, view }) {
  const { unit, order, colors, describe, yFallback, yPad, yZero, gapMs, decimals } = METRICS[metric];
  const fmtVal = (v) => (decimals ? v.toFixed(decimals) : String(Math.round(v)));
  const wrapperRef = useRef(null);
  const [{ width, height }, setSize] = useState({ width: 0, height: chartHeight() });
  const [hoverIdx, setHoverIdx] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [zoom, setZoom] = useState(null); // [t0, t1] | null
  const [drag, setDrag] = useState(null); // {x0, x1} | null
  const [showLine, setShowLine] = useState(true);
  const [showDot, setShowDot] = useState(true);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: chartHeight() });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // A new fetch means a new time range: drop the zoom
  useEffect(() => {
    setZoom(null);
    setHoverIdx(null);
    setDrag(null);
  }, [samples]);

  // bpm and hrv share source names ("sleep", "rest") that mean
  // different things — a filter from one mustn't leak into the other
  useEffect(() => setHidden(new Set()), [metric]);

  const allSources = useMemo(() => {
    const present = new Set(samples.map((s) => s.source));
    return order.filter((s) => present.has(s));
  }, [samples, order]);

  // The x extent is always the asked-for window (sparse data shows as
  // blank space), zoomed in when a zoom is set
  const domain = useMemo(
    () => zoom ?? view.domain ?? dayBoundsMs(view.start, view.end),
    [zoom, view]
  );

  const shown = useMemo(() => {
    let list = samples;
    if (hidden.size) list = list.filter((s) => !hidden.has(s.source));
    return list.filter((s) => s.t >= domain[0] && s.t <= domain[1]);
  }, [samples, hidden, domain]);

  const geo = useMemo(
    () =>
      width > 0
        ? buildChart(shown, width, height, { order, domain, yFallback, yPad, yZero, gapMs })
        : null,
    [shown, width, height, order, domain, yFallback, yPad, yZero, gapMs]
  );

  const stats = useMemo(() => (shown.length ? buildStats(shown) : null), [shown]);

  const toggleSource = (source) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      // never hide the whole chart
      if (allSources.every((s) => next.has(s))) return prev;
      return next;
    });
    setHoverIdx(null);
  };

  const plotX = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.min(Math.max(e.clientX - rect.left, geo.plot.x), geo.plot.x + geo.plot.w);
  };

  const onPointerDown = (e) => {
    if (!geo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const x = plotX(e);
    setDrag({ x0: x, x1: x });
  };

  const onPointerMove = (e) => {
    if (!geo) return;
    const x = plotX(e);
    if (drag) setDrag((d) => ({ ...d, x1: x }));
    if (shown.length) setHoverIdx(nearestIndex(shown, geo.xToT(x)));
  };

  const onPointerUp = () => {
    if (!drag || !geo) return;
    const lo = Math.min(drag.x0, drag.x1);
    const hi = Math.max(drag.x0, drag.x1);
    setDrag(null);
    if (hi - lo >= MIN_ZOOM_DRAG_PX) {
      setZoom([geo.xToT(lo), geo.xToT(hi)]);
      setHoverIdx(null);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") return setHoverIdx(null);
    if (!shown.length) return;
    const delta = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    setHoverIdx((idx) => Math.min(Math.max((idx ?? 0) + delta, 0), shown.length - 1));
  };

  const hovered = hoverIdx === null ? null : shown[hoverIdx];
  const tipOnLeft = hovered && geo && geo.toX(hovered.t) > geo.plot.x + geo.plot.w * 0.62;

  return (
    <div className="hr-chart" ref={wrapperRef}>
      <div className="hr-legend">
        {allSources.map((source) => (
          <button
            key={source}
            className={`hr-legend-item${hidden.has(source) ? " hr-legend-off" : ""}`}
            data-tip={describe[source]}
            onClick={() => toggleSource(source)}
          >
            <span className="hr-key" style={{ backgroundColor: colors[source] }} />
            {prettySource(source)}
          </button>
        ))}
        <span className="hr-legend-right">
          {zoom && (
            <button
              className="hr-legend-item hr-zoom-reset"
              data-tip="or double-click the chart"
              onClick={() => setZoom(null)}
            >
              ⟲ reset zoom
            </button>
          )}
          <label className="hr-check">
            <input type="checkbox" checked={showLine} onChange={(e) => setShowLine(e.target.checked)} />
            line
          </label>
          <label className="hr-check">
            <input type="checkbox" checked={showDot} onChange={(e) => setShowDot(e.target.checked)} />
            dot
          </label>
        </span>
      </div>
      {geo && (
        <div className="hr-plot-wrapper">
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${metric} over time; drag to zoom`}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              setHoverIdx(null);
              setDrag(null);
            }}
            onDoubleClick={() => setZoom(null)}
            onKeyDown={onKeyDown}
          >
            {geo.yTicks.map(({ y, label }) => (
              <g key={label}>
                <line className="hr-grid" x1={geo.plot.x} x2={geo.plot.x + geo.plot.w} y1={y} y2={y} />
                <text className="hr-tick-label" x={geo.plot.x - 8} y={y + 3} textAnchor="end">
                  {label}
                </text>
              </g>
            ))}
            {geo.dayLines.map((x, i) => (
              <line
                className="hr-dayline"
                key={i}
                x1={x}
                x2={x}
                y1={geo.plot.y}
                y2={geo.plot.y + geo.plot.h}
              />
            ))}
            {geo.xTicks.map(({ x, label, isDate }, i) => (
              <text
                className={isDate ? "hr-tick-date" : "hr-tick-label"}
                key={i}
                x={x}
                y={geo.plot.y + geo.plot.h + 16}
                textAnchor="middle"
              >
                {label}
              </text>
            ))}
            <line
              className="hr-axis"
              x1={geo.plot.x}
              x2={geo.plot.x + geo.plot.w}
              y1={geo.plot.y + geo.plot.h}
              y2={geo.plot.y + geo.plot.h}
            />
            {showLine &&
              geo.runs.map((run, i) =>
                run.samples.length === 1 ? (
                  !showDot && (
                    <circle
                      key={i}
                      cx={geo.toX(run.samples[0].t)}
                      cy={geo.toY(run.samples[0].value)}
                      r={3}
                      fill={colors[run.source]}
                    />
                  )
                ) : (
                  <polyline
                    key={i}
                    points={run.points}
                    fill="none"
                    stroke={colors[run.source]}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )
              )}
            {showDot &&
              shown.map((s, i) => (
                <circle
                  key={i}
                  cx={geo.toX(s.t)}
                  cy={geo.toY(s.value)}
                  r={3}
                  fill={colors[s.source]}
                />
              ))}
            {drag && Math.abs(drag.x1 - drag.x0) >= MIN_ZOOM_DRAG_PX && (
              <rect
                className="hr-select"
                x={Math.min(drag.x0, drag.x1)}
                width={Math.abs(drag.x1 - drag.x0)}
                y={geo.plot.y}
                height={geo.plot.h}
              />
            )}
            {hovered && !drag && (
              <g>
                <line
                  className="hr-crosshair"
                  x1={geo.toX(hovered.t)}
                  x2={geo.toX(hovered.t)}
                  y1={geo.plot.y}
                  y2={geo.plot.y + geo.plot.h}
                />
                <circle
                  cx={geo.toX(hovered.t)}
                  cy={geo.toY(hovered.value)}
                  r={4}
                  fill={colors[hovered.source]}
                  stroke="#000000"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
          {hovered && !drag && (
            <div
              className="hr-tooltip"
              style={{
                left: geo.toX(hovered.t),
                top: geo.plot.y,
                transform: tipOnLeft ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
              }}
            >
              <div className="hr-tip-bpm">
                {fmtVal(hovered.value)} <span className="hr-tip-unit">{unit}</span>
              </div>
              <div className="hr-tip-source">
                <span className="hr-key" style={{ backgroundColor: colors[hovered.source] }} />
                {prettySource(hovered.source)}
              </div>
              <div className="hr-tip-time">{fmtTime(hovered.t)}</div>
            </div>
          )}
        </div>
      )}
      {stats && (
        <p className="hr-stats">
          <span className="hr-stat-pair">
            <span className="hr-stat-value">{stats.count}</span> samples
          </span>{" "}
          ·{" "}
          <span className="hr-stat-pair">
            min <span className="hr-stat-value">{fmtVal(stats.min)}</span>
          </span>{" "}
          ·{" "}
          <span className="hr-stat-pair">
            avg <span className="hr-stat-value">{fmtVal(stats.avg)}</span>
          </span>{" "}
          ·{" "}
          <span className="hr-stat-pair">
            max <span className="hr-stat-value">{fmtVal(stats.max)}</span> {unit}
          </span>
        </p>
      )}
    </div>
  );
}

// ============================================
// PAGE
// ============================================

export default function OuraHr() {
  const [auth, setAuth] = useState(getStoredAuth);
  const [authNotice] = useState(takeAuthError);
  const [clientIdInput, setClientIdInput] = useState(getClientId);
  const [tokenInput, setTokenInput] = useState("");
  const [{ start, end, domain }, setRange] = useState(() => rangeForPreset(PRESETS[0]));
  const [preset, setPreset] = useState("1d");
  const [fetchedView, setFetchedView] = useState(null);
  const [metric, setMetric] = useState("bpm");
  const [proxyInput, setProxyInput] = useState(getProxyBase);
  const [phase, setPhase] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState(null);
  const [progress, setProgress] = useState(0);
  const [samples, setSamples] = useState([]);
  const [cornerOpen, setCornerOpen] = useState(false);
  const requestRef = useRef(0);

  const FETCHERS = { bpm: fetchHeartrate, hrv: fetchHrv, steps: fetchSteps, stress: fetchStress };

  // Run a fetch, ignoring its result if a newer request has started
  const run = async (token, startDate, endDate, which = metric, force = false, viewDomain = null) => {
    const fetcher = FETCHERS[which];
    const requestId = ++requestRef.current;
    setPhase("loading");
    setProgress(0);
    try {
      const result = await fetcher({ token, startDate, endDate, onProgress: setProgress, force });
      if (requestId !== requestRef.current) return;
      setSamples(result);
      setFetchedView({ start: startDate, end: endDate, domain: viewDomain });
      setPhase("ready");
    } catch (e) {
      if (requestId !== requestRef.current) return;
      if (e.status === 401) {
        clearAuth();
        setAuth(null);
      }
      setError(e.message || "something went wrong");
      setErrorCode(e.code ?? null);
      setPhase("error");
    }
  };

  // Already connected (or just back from the oauth redirect): fetch right away
  useEffect(() => {
    if (auth) run(auth.token, start, end, metric, false, domain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = () => {
    let clientId = clientIdInput.trim();
    if (!clientId) return;
    // undocumented alias
    if (clientId.toLowerCase() === "claire") clientId = "d9b7271c-634e-4e3a-9e27-81d1ae6e894e";
    setClientId(clientId);
    beginLogin(clientId);
  };

  const applyToken = () => {
    const token = tokenInput.trim();
    if (!token) return;
    storeToken(token);
    const stored = getStoredAuth();
    setAuth(stored);
    setTokenInput("");
    run(stored.token, start, end);
  };

  const disconnect = () => {
    clearAuth();
    setAuth(null);
    setSamples([]);
    setPhase("idle");
    setCornerOpen(false);
  };

  const fetchRange = (startDate, endDate, force = false, viewDomain = null) => {
    // Tolerate a backwards range instead of erroring
    const [s, e] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
    if (auth) run(auth.token, s, e, metric, force, viewDomain);
  };

  const pickPreset = (p) => {
    const range = rangeForPreset(p);
    setRange(range);
    setPreset(p.label);
    fetchRange(range.start, range.end, false, range.domain);
  };

  const pickMetric = (which) => {
    if (which === metric) return;
    setMetric(which);
    if (auth) run(auth.token, start, end, which, false, domain);
  };

  const setDay = (key) => (e) => {
    setRange((r) => ({ ...r, [key]: e.target.value, domain: null }));
    setPreset(null);
  };

  const saveProxy = () => {
    setProxyBase(proxyInput);
    setProxyInput(getProxyBase());
    if (auth) run(auth.token, start, end);
  };

  const proxyField = (
    <div className="hr-token-row">
      <input
        className="hr-input"
        type="text"
        value={proxyInput}
        spellCheck={false}
        placeholder={DEFAULT_PROXY}
        aria-label="api proxy url"
        onChange={(e) => setProxyInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveProxy();
        }}
      />
      <button className="hr-button" onClick={saveProxy}>
        {auth ? "save & retry" : "save"}
      </button>
    </div>
  );

  const stamp = `${start}_${end}`;

  return (
    <div id="app-base" className="ourahr-colors">
      <div className="content-wrapper ourahr-colors">
        {!auth ? (
          <div className="hr-connect">
            <div className="hr-title-row">
              <span className="hr-prompt">&gt;</span> oura tracking data
            </div>
            {authNotice && <p className="hr-status hr-status-error">login failed: {authNotice}</p>}
            {phase === "error" && <p className="hr-status hr-status-error">error: {error}</p>}
            <label className="hr-field">
              <span className="hr-field-label">oura app client id</span>
              <input
                className="hr-input"
                type="text"
                value={clientIdInput}
                spellCheck={false}
                placeholder="from cloud.ouraring.com"
                onChange={(e) => setClientIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") connect();
                }}
              />
            </label>
            <button className="hr-button" onClick={connect} disabled={!clientIdInput.trim()}>
              connect to oura
            </button>
            <details className="hr-help">
              <summary>first-time setup</summary>
              <ol>
                <li>
                  create an app at{" "}
                  <a href="https://cloud.ouraring.com/oauth/applications" target="_blank" rel="noreferrer">
                    cloud.ouraring.com/oauth/applications
                  </a>
                </li>
                <li>
                  add redirect uris:
                  <code className="hr-uri">{window.location.origin}/oura-callback.html</code>
                  <code className="hr-uri">http://localhost:3000/oura-callback.html</code>
                </li>
                <li>paste the app's client id above and connect</li>
                <li>
                  oura blocks direct browser calls, so requests route through the{" "}
                  <code>oura-proxy/</code> cloudflare worker by default — override here if
                  you run your own:
                  {proxyField}
                </li>
              </ol>
            </details>
            <details className="hr-help">
              <summary>or paste an access token</summary>
              <p className="hr-muted">
                any oura api token works here; type <code>demo</code> to poke around with fake data
              </p>
              <div className="hr-token-row">
                <input
                  className="hr-input"
                  type="password"
                  value={tokenInput}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="token"
                  aria-label="access token"
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyToken();
                  }}
                />
                <button className="hr-button" onClick={applyToken} disabled={!tokenInput.trim()}>
                  use token
                </button>
              </div>
            </details>
          </div>
        ) : (
          <>
            <div className="hr-corner">
              {cornerOpen && (
                <button className="hr-button hr-quiet" onClick={disconnect}>
                  disconnect
                </button>
              )}
              <button
                className="hr-heart"
                aria-label="account"
                onClick={() => setCornerOpen((v) => !v)}
              >
                {cornerOpen ? "♥" : "♡"}
              </button>
            </div>
            <div className="hr-filters">
              {Object.keys(METRICS).map((m) => (
                <button
                  key={m}
                  className={`hr-button hr-preset${metric === m ? " hr-preset-active" : ""}`}
                  onClick={() => pickMetric(m)}
                >
                  {m}
                </button>
              ))}
              <span className="hr-filter-spacer" />
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={`hr-button hr-preset${preset === p.label ? " hr-preset-active" : ""}`}
                  onClick={() => pickPreset(p)}
                >
                  {p.label}
                </button>
              ))}
              <span className="hr-filter-divider" />
              <span className="hr-dates">
                <input className="hr-input hr-date" type="date" value={start} onChange={setDay("start")} aria-label="start date" />
                <span className="hr-muted">to</span>
                <input className="hr-input hr-date" type="date" value={end} onChange={setDay("end")} aria-label="end date" />
                <button className="hr-button" onClick={() => fetchRange(start, end, true, domain)}>
                  fetch
                </button>
              </span>
            </div>

            {phase === "loading" && (
              <p className="hr-status">
                fetching {metric} data... {progress > 0 && `${progress} fetched`}
              </p>
            )}
            {phase === "error" && <p className="hr-status hr-status-error">error: {error}</p>}
            {phase === "error" && errorCode === "unreachable" && (
              <div className="hr-proxy-fix">
                <p className="hr-muted">
                  api proxy url (deploy the repo's <code>oura-proxy/</code> — readme inside):
                </p>
                {proxyField}
              </div>
            )}
            {fetchedView && (
              <div className={`hr-results${phase === "loading" ? " hr-stale" : ""}`}>
                <HrChart samples={samples} metric={metric} view={fetchedView} />
                {samples.length > 0 && (
                  <div className="hr-utility">
                  <button
                    className="hr-button hr-quiet"
                    onClick={() =>
                      download(
                        `oura-${metric}_${stamp}.csv`,
                        toCsv(samples, METRICS[metric].csvColumn),
                        "text/csv"
                      )
                    }
                  >
                    download csv
                  </button>
                  <button
                    className="hr-button hr-quiet"
                    onClick={() =>
                      download(
                        `oura-${metric}_${stamp}.json`,
                        JSON.stringify(samples, null, 2),
                        "application/json"
                      )
                    }
                  >
                    download json
                  </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
