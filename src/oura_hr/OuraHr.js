import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/ourahr.css";
import {
  beginLogin,
  clearAuth,
  fetchHeartrate,
  getClientId,
  getProxyBase,
  getStoredAuth,
  setClientId,
  setProxyBase,
  storeToken,
  takeAuthError,
  toCsv,
} from "./ouraApi";
import { SOURCE_COLORS, buildChart, buildStats, fmtTime, nearestIndex } from "./hrViz";

const CHART_HEIGHT = 320;
const TABLE_PREVIEW_ROWS = 500;
const PRESETS = [
  { label: "today", days: 1 },
  { label: "3d", days: 3 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

function toDayStr(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function presetRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { start: toDayStr(start), end: toDayStr(end) };
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

// ============================================
// CHART
// ============================================

function HrChart({ samples }) {
  const wrapperRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const geo = useMemo(
    () => (width > 0 ? buildChart(samples, width, CHART_HEIGHT) : null),
    [samples, width]
  );

  const onPointerMove = (e) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, geo.plot.x), geo.plot.x + geo.plot.w);
    setHoverIdx(nearestIndex(samples, geo.xToT(x)));
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") return setHoverIdx(null);
    const delta = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    setHoverIdx((idx) =>
      Math.min(Math.max((idx ?? 0) + delta, 0), samples.length - 1)
    );
  };

  const hovered = hoverIdx === null ? null : samples[hoverIdx];
  const tipOnLeft = hovered && geo && geo.toX(hovered.t) > geo.plot.x + geo.plot.w * 0.62;

  return (
    <div className="hr-chart" ref={wrapperRef}>
      {geo && (
        <div className="hr-legend">
          {geo.sources.map((source) => (
            <span className="hr-legend-item" key={source}>
              <span className="hr-key" style={{ backgroundColor: SOURCE_COLORS[source] }} />
              {source}
            </span>
          ))}
        </div>
      )}
      {geo && (
        <div className="hr-plot-wrapper">
          <svg
            width={width}
            height={CHART_HEIGHT}
            role="img"
            aria-label="heart rate over time"
            tabIndex={0}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHoverIdx(null)}
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
            {geo.xTicks.map(({ x, label }, i) => (
              <text
                className="hr-tick-label"
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
            {geo.runs.map((run, i) =>
              run.samples.length === 1 ? (
                <circle
                  key={i}
                  cx={geo.toX(run.samples[0].t)}
                  cy={geo.toY(run.samples[0].bpm)}
                  r={2.5}
                  fill={SOURCE_COLORS[run.source]}
                />
              ) : (
                <polyline
                  key={i}
                  points={run.points}
                  fill="none"
                  stroke={SOURCE_COLORS[run.source]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )
            )}
            {hovered && (
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
                  cy={geo.toY(hovered.bpm)}
                  r={4}
                  fill={SOURCE_COLORS[hovered.source]}
                  stroke="#000000"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
          {hovered && (
            <div
              className="hr-tooltip"
              style={{
                left: geo.toX(hovered.t),
                top: geo.plot.y,
                transform: tipOnLeft ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
              }}
            >
              <div className="hr-tip-bpm">
                {hovered.bpm} <span className="hr-tip-unit">bpm</span>
              </div>
              <div className="hr-tip-source">
                <span className="hr-key" style={{ backgroundColor: SOURCE_COLORS[hovered.source] }} />
                {hovered.source}
              </div>
              <div className="hr-tip-time">{fmtTime(hovered.t)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// DATA TABLE + EXPORTS
// ============================================

function SampleTable({ samples }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="hr-table-details" onToggle={(e) => setOpen(e.target.open)}>
      <summary>data table</summary>
      {open && (
        <>
          {samples.length > TABLE_PREVIEW_ROWS && (
            <p className="hr-muted">
              showing first {TABLE_PREVIEW_ROWS} of {samples.length} — download the csv for all of them
            </p>
          )}
          <table className="hr-table">
            <thead>
              <tr>
                <th>time</th>
                <th>bpm</th>
                <th>source</th>
              </tr>
            </thead>
            <tbody>
              {samples.slice(0, TABLE_PREVIEW_ROWS).map((s) => (
                <tr key={s.t}>
                  <td>{fmtTime(s.t)}</td>
                  <td>{s.bpm}</td>
                  <td>{s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </details>
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
  const [{ start, end }, setRange] = useState(() => presetRange(3));
  const [preset, setPreset] = useState("3d");
  const [proxyInput, setProxyInput] = useState(getProxyBase);
  const [phase, setPhase] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState(null);
  const [progress, setProgress] = useState(0);
  const [samples, setSamples] = useState([]);
  const requestRef = useRef(0);

  // Run a fetch, ignoring its result if a newer request has started
  const run = async (token, startDate, endDate) => {
    const requestId = ++requestRef.current;
    setPhase("loading");
    setProgress(0);
    try {
      const result = await fetchHeartrate({ token, startDate, endDate, onProgress: setProgress });
      if (requestId !== requestRef.current) return;
      setSamples(result);
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
    if (auth) run(auth.token, start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = () => {
    const clientId = clientIdInput.trim();
    if (!clientId) return;
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
  };

  const fetchRange = (startDate, endDate) => {
    // Tolerate a backwards range instead of erroring
    const [s, e] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
    if (auth) run(auth.token, s, e);
  };

  const pickPreset = ({ label, days }) => {
    const range = presetRange(days);
    setRange(range);
    setPreset(label);
    fetchRange(range.start, range.end);
  };

  const setDay = (key) => (e) => {
    setRange((r) => ({ ...r, [key]: e.target.value }));
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
        placeholder="https://oura-proxy.<you>.workers.dev"
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

  const stats = useMemo(() => (samples.length ? buildStats(samples) : null), [samples]);
  const stamp = `${start}_${end}`;

  return (
    <div id="app-base" className="ourahr-colors">
      <div className="content-wrapper ourahr-colors">
        {!auth ? (
          <div className="hr-connect">
            <div className="hr-title-row">
              <span className="hr-prompt">&gt;</span> oura heartrate
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
                  oura blocks direct browser calls, so deploy the tiny forwarder in the
                  repo's <code>oura-proxy/</code> (readme inside) and paste its url:
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
            <div className="hr-filters">
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
              <input className="hr-input hr-date" type="date" value={start} onChange={setDay("start")} aria-label="start date" />
              <span className="hr-muted">to</span>
              <input className="hr-input hr-date" type="date" value={end} onChange={setDay("end")} aria-label="end date" />
              <button className="hr-button" onClick={() => fetchRange(start, end)}>
                fetch
              </button>
              <span className="hr-filter-spacer" />
              <button className="hr-button hr-quiet" onClick={disconnect}>
                disconnect
              </button>
            </div>

            {phase === "loading" && (
              <p className="hr-status">fetching heartrate data... {progress > 0 && `${progress} samples`}</p>
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
            {phase === "ready" && samples.length === 0 && (
              <p className="hr-status">no heartrate samples in that range</p>
            )}

            {samples.length > 0 && (
              <div className={`hr-results${phase === "loading" ? " hr-stale" : ""}`}>
                <HrChart samples={samples} />
                {stats && (
                  <p className="hr-stats">
                    {stats.count} samples · min {stats.min} · avg {stats.avg} · max {stats.max} bpm
                  </p>
                )}
                <div className="hr-actions">
                  <button
                    className="hr-button"
                    onClick={() => download(`oura-hr_${stamp}.csv`, toCsv(samples), "text/csv")}
                  >
                    download csv
                  </button>
                  <button
                    className="hr-button"
                    onClick={() =>
                      download(`oura-hr_${stamp}.json`, JSON.stringify(samples, null, 2), "application/json")
                    }
                  >
                    download json
                  </button>
                </div>
                <SampleTable samples={samples} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
