// Data layer for the oura heartrate page: OAuth2 implicit-grant login,
// token storage, and paginated fetching of /v2/usercollection/heartrate.

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";

const AUTH_KEY = "oura_auth";
const CLIENT_ID_KEY = "oura_client_id";
const STATE_KEY = "oura_oauth_state";
const AUTH_ERROR_KEY = "oura_auth_error";
const PROXY_KEY = "oura_proxy_base";

// api.ouraring.com refuses browser (CORS) calls outright, so prod goes
// through the deployed oura-proxy/ worker; dev uses the CRA proxy in
// setupProxy.js. A localStorage override (the page's proxy field) wins
// over both, for anyone running their own forwarder.
export const DEFAULT_PROXY = "https://oura-proxy.connor-j-hopkins.workers.dev";

function apiBase() {
  const proxy = getProxyBase();
  if (proxy) return proxy;
  return process.env.NODE_ENV === "development" ? "/oura-api" : DEFAULT_PROXY;
}

export const getProxyBase = () => localStorage.getItem(PROXY_KEY) ?? "";
export function setProxyBase(url) {
  const cleaned = url.trim().replace(/\/+$/, "");
  if (cleaned) localStorage.setItem(PROXY_KEY, cleaned);
  else localStorage.removeItem(PROXY_KEY);
}

// Fallback when the redirect omits expires_in; oura implicit tokens last 30 days
const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const getClientId = () => localStorage.getItem(CLIENT_ID_KEY) ?? "";
export const setClientId = (id) => localStorage.setItem(CLIENT_ID_KEY, id.trim());

export function getStoredAuth() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (!auth?.token) return null;
    if (auth.expiresAt && Date.now() >= auth.expiresAt) {
      clearAuth();
      return null;
    }
    return auth;
  } catch {
    return null;
  }
}

export function storeToken(token) {
  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({ token: token.trim(), expiresAt: Date.now() + DEFAULT_TOKEN_TTL_MS })
  );
}

export const clearAuth = () => localStorage.removeItem(AUTH_KEY);

// One-shot read of any error the oauth callback page left behind
export function takeAuthError() {
  const error = sessionStorage.getItem(AUTH_ERROR_KEY);
  sessionStorage.removeItem(AUTH_ERROR_KEY);
  return error;
}

// Send the browser to oura's consent page; the redirect lands on
// /oura-callback.html, which stores the token and returns to this page
export function beginLogin(clientId) {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: "token",
    client_id: clientId,
    redirect_uri: `${window.location.origin}/oura-callback.html`,
    scope: "heartrate",
    state,
  });
  window.location.assign(`${AUTHORIZE_URL}?${params}`);
}

// yyyy-mm-dd (from <input type="date">) -> ISO datetime with the local
// utc offset, so day bounds mean local days rather than utc days
function isoWithOffset(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`
  );
}

const parseDay = (yyyyMmDd) => yyyyMmDd.split("-").map(Number);

function localDayStart(yyyyMmDd) {
  const [y, m, d] = parseDay(yyyyMmDd);
  return isoWithOffset(new Date(y, m - 1, d, 0, 0, 0));
}

function localDayEnd(yyyyMmDd) {
  const [y, m, d] = parseDay(yyyyMmDd);
  return isoWithOffset(new Date(y, m - 1, d, 23, 59, 59));
}

const MAX_PAGES = 200;

// Fetch every heartrate sample in [startDate, endDate] (inclusive local
// days), following next_token pagination. Returns rows sorted by time,
// each { timestamp, bpm, source, t } where t is epoch ms.
export async function fetchHeartrate({ token, startDate, endDate, onProgress }) {
  if (token === "demo") return demoSamples(startDate, endDate);

  const samples = [];
  let nextToken = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      start_datetime: localDayStart(startDate),
      end_datetime: localDayEnd(endDate),
    });
    if (nextToken) params.set("next_token", nextToken);

    let resp;
    try {
      resp = await fetch(`${apiBase()}/v2/usercollection/heartrate?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      const err = new Error(
        getProxyBase()
          ? "couldn't reach the api proxy — check its url"
          : "couldn't reach the api proxy — is the oura-proxy worker up?"
      );
      err.code = "unreachable";
      throw err;
    }
    if (resp.status === 401) {
      const err = new Error("oura rejected the token (expired or revoked) — reconnect");
      err.status = 401;
      throw err;
    }
    if (resp.status === 429) throw new Error("rate limited by oura — wait a minute, then retry");
    if (!resp.ok) throw new Error(`oura api error (${resp.status})`);

    const body = await resp.json();
    samples.push(...body.data);
    nextToken = body.next_token ?? null;
    onProgress?.(samples.length);
    if (!nextToken) break;
    if (page === MAX_PAGES - 1) throw new Error("range too large — narrow the dates");
  }

  return samples
    .map((s) => ({ timestamp: s.timestamp, bpm: s.bpm, source: s.source, t: Date.parse(s.timestamp) }))
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.bpm))
    .sort((a, b) => a.t - b.t);
}

export function toCsv(samples) {
  const rows = samples.map((s) => `${s.timestamp},${s.bpm},${s.source}`);
  return `timestamp,bpm,source\n${rows.join("\n")}\n`;
}

// ============================================
// DEMO DATA (token "demo"): plausible days of samples, no api involved
// ============================================

function demoSamples(startDate, endDate) {
  const [y0, m0, d0] = parseDay(startDate);
  const [y1, m1, d1] = parseDay(endDate);
  const end = new Date(y1, m1 - 1, d1 + 1, 7, 0, 0).getTime();
  const samples = [];
  const noise = (amp) => (Math.random() - 0.5) * amp;
  const push = (t, bpm, source) => {
    if (t <= end) samples.push({ timestamp: new Date(t).toISOString(), bpm: Math.round(bpm), source, t });
  };

  for (let day = new Date(y0, m0 - 1, d0); day.getTime() < end; day.setDate(day.getDate() + 1)) {
    const at = (h, min = 0) =>
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min).getTime();
    // night: 11pm-7am sleep at 5min cadence, slow sinusoid around 52
    for (let i = 0; i < 96; i++) {
      push(at(23) + i * 5 * 60_000, 52 + 6 * Math.sin(i / 9) + noise(4), "sleep");
    }
    // day: awake/rest samples every ~10min, quiet during workout/session
    for (let i = 0; i < 90; i++) {
      const t = at(7, 30) + i * 10 * 60_000 + noise(120_000);
      if (t >= at(8, 5) && t <= at(8, 30)) continue;
      if (t >= at(17, 25) && t <= at(18, 20)) continue;
      const calm = Math.sin(i / 7) > 0.4;
      push(t, calm ? 64 + noise(6) : 78 + noise(10), calm ? "rest" : "awake");
    }
    // 45min evening workout at 1min cadence, ramp up then down
    for (let i = 0; i < 45; i++) {
      const effort = Math.sin((i / 45) * Math.PI);
      push(at(17, 30) + i * 60_000, 85 + 65 * effort + noise(8), "workout");
    }
    // 15min morning breathing session
    for (let i = 0; i < 15; i++) {
      push(at(8, 10) + i * 60_000, 66 - i * 0.6 + noise(3), "session");
    }
  }
  return samples.sort((a, b) => a.t - b.t);
}
