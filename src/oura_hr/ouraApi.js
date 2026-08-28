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
    scope: "heartrate daily",
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

// Fetch every document from a usercollection route, following
// next_token pagination
async function fetchAllPages({ token, route, params, onProgress }) {
  const docs = [];
  let nextToken = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams(params);
    if (nextToken) query.set("next_token", nextToken);

    let resp;
    try {
      resp = await fetch(`${apiBase()}/v2/usercollection/${route}?${query}`, {
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
    if (resp.status === 403) {
      throw new Error("token is missing a scope — disconnect, then reconnect to re-consent");
    }
    if (resp.status === 429) throw new Error("rate limited by oura — wait a minute, then retry");
    if (!resp.ok) throw new Error(`oura api error (${resp.status})`);

    const body = await resp.json();
    docs.push(...body.data);
    nextToken = body.next_token ?? null;
    onProgress?.(docs.length);
    if (!nextToken) break;
    if (page === MAX_PAGES - 1) throw new Error("range too large — narrow the dates");
  }
  return docs;
}

const byTime = (a, b) => a.t - b.t;
const finite = (s) => Number.isFinite(s.t) && Number.isFinite(s.value);

// Heartrate ranges are fetched as parallel chunks of consecutive days
// (next_token pagination is sequential, but separate windows aren't),
// and completed days are cached for the rest of the page load — only
// today keeps changing. `force` (the fetch button) bypasses the cache.
const HR_CHUNK_DAYS = 3;
const HR_CONCURRENCY = 6;
const hrDayCache = new Map(); // "yyyy-mm-dd" -> that local day's samples

const pad2 = (n) => String(n).padStart(2, "0");
const dayOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

function nextDay(yyyyMmDd) {
  const [y, m, d] = parseDay(yyyyMmDd);
  return dayOf(new Date(y, m - 1, d + 1));
}

function listDays(startDate, endDate) {
  const days = [];
  for (let day = startDate; day <= endDate; day = nextDay(day)) days.push(day);
  return days;
}

// Run worker over items with at most `limit` in flight
async function runPool(items, limit, worker) {
  let i = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await worker(items[i++]);
  });
  await Promise.all(lanes);
}

// Every heartrate sample in [startDate, endDate] (inclusive local days),
// sorted; each { timestamp, value: bpm, source, t (epoch ms) }
export async function fetchHeartrate({ token, startDate, endDate, onProgress, force }) {
  if (token === "demo") return demoHeartrate(startDate, endDate);

  const today = dayOf(new Date());
  const days = listDays(startDate, endDate);
  const missing = days.filter((d) => force || d >= today || !hrDayCache.has(d));

  // group missing days into chunks of consecutive days
  const chunks = [];
  for (const day of missing) {
    const current = chunks.at(-1);
    if (current && current.length < HR_CHUNK_DAYS && nextDay(current.at(-1)) === day) {
      current.push(day);
    } else {
      chunks.push([day]);
    }
  }

  let fetchedCount = 0;
  const fresh = new Map(); // day -> samples fetched this call
  await runPool(chunks, HR_CONCURRENCY, async (chunk) => {
    const docs = await fetchAllPages({
      token,
      route: "heartrate",
      params: {
        start_datetime: localDayStart(chunk[0]),
        end_datetime: localDayEnd(chunk.at(-1)),
      },
    });
    const rows = docs
      .map((s) => ({ timestamp: s.timestamp, value: s.bpm, source: s.source, t: Date.parse(s.timestamp) }))
      .filter(finite);
    fetchedCount += rows.length;
    onProgress?.(fetchedCount);
    for (const s of rows) {
      const day = dayOf(new Date(s.t));
      if (!fresh.has(day)) fresh.set(day, []);
      fresh.get(day).push(s);
    }
    // a fetched day with no samples still counts as fetched
    for (const day of chunk) {
      if (!fresh.has(day)) fresh.set(day, []);
    }
  });

  const all = [];
  for (const day of days) {
    const rows = fresh.has(day) ? fresh.get(day) : hrDayCache.get(day);
    if (fresh.has(day) && day < today) hrDayCache.set(day, rows);
    all.push(...rows);
  }
  return all.sort(byTime);
}

// Every hrv (rmssd, ms) sample in the range. Oura only measures hrv
// during sleep, delivered as a 5-minute series inside each sleep
// document; source is the sleep period's type.
export async function fetchHrv({ token, startDate, endDate, onProgress }) {
  if (token === "demo") return demoHrv(startDate, endDate);

  const docs = await fetchAllPages({
    token,
    route: "sleep",
    params: { start_date: startDate, end_date: endDate },
    onProgress,
  });
  const samples = [];
  for (const doc of docs) {
    if (doc.type === "deleted" || !doc.hrv?.items?.length) continue;
    const t0 = Date.parse(doc.hrv.timestamp);
    const stepMs = (doc.hrv.interval ?? 300) * 1000;
    doc.hrv.items.forEach((value, i) => {
      if (value === null) return;
      const t = t0 + i * stepMs;
      samples.push({
        timestamp: new Date(t).toISOString(),
        value,
        source: doc.type ?? "sleep",
        t,
      });
    });
  }
  return samples.filter(finite).sort(byTime);
}

export function toCsv(samples, valueColumn) {
  const rows = samples.map((s) => `${s.timestamp},${s.value},${s.source}`);
  return `timestamp,${valueColumn},source\n${rows.join("\n")}\n`;
}

// ============================================
// DEMO DATA (token "demo"): plausible days of samples, no api involved
// ============================================

const noise = (amp) => (Math.random() - 0.5) * amp;

function demoHeartrate(startDate, endDate) {
  const [y0, m0, d0] = parseDay(startDate);
  const [y1, m1, d1] = parseDay(endDate);
  const end = new Date(y1, m1 - 1, d1 + 1, 7, 0, 0).getTime();
  const samples = [];
  const push = (t, value, source) => {
    if (t <= end) samples.push({ timestamp: new Date(t).toISOString(), value: Math.round(value), source, t });
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
  return samples.sort(byTime);
}

function demoHrv(startDate, endDate) {
  const [y0, m0, d0] = parseDay(startDate);
  const [y1, m1, d1] = parseDay(endDate);
  const end = new Date(y1, m1 - 1, d1 + 1, 7, 0, 0).getTime();
  const samples = [];

  for (let day = new Date(y0, m0 - 1, d0); day.getTime() < end; day.setDate(day.getDate() + 1)) {
    const night = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 0).getTime();
    // rmssd climbs through the night with slow waves, 5min cadence
    for (let i = 0; i < 96; i++) {
      const t = night + i * 5 * 60_000;
      if (t > end) break;
      const value = 45 + i / 4 + 18 * Math.sin(i / 7) + noise(12);
      samples.push({
        timestamp: new Date(t).toISOString(),
        value: Math.max(15, Math.round(value)),
        source: "long_sleep",
        t,
      });
    }
    // occasional afternoon nap
    if (day.getDate() % 3 === 0) {
      const nap = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14, 30).getTime();
      for (let i = 0; i < 12; i++) {
        const t = nap + i * 5 * 60_000;
        if (t > end) break;
        samples.push({
          timestamp: new Date(t).toISOString(),
          value: Math.round(55 + 10 * Math.sin(i / 3) + noise(8)),
          source: "late_nap",
          t,
        });
      }
    }
  }
  return samples.sort(byTime);
}
