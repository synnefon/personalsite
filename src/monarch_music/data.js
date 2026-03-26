// ── Grouping ────────────────────────────────────────────

function groupByDay(sightings, year) {
  const byDay = {};
  for (const s of sightings) {
    const [month, day, yr] = s.date.split("/");
    const key = `${yr}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(s);
  }

  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const result = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, sightings: byDay[key] || [] });
  }
  return result;
}

// ── Fetch from pre-baked static data ────────────────────

export async function fetchSightings(year) {
  const cacheKey = `monarch-sightings-${year}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  const res = await fetch(`${process.env.PUBLIC_URL}/data/monarch/${year}.json`);
  const sightings = await res.json();
  const grouped = groupByDay(sightings, year);

  try {
    localStorage.setItem(cacheKey, JSON.stringify(grouped));
  } catch (_) {
    // localStorage full — skip caching
  }

  return grouped;
}

// ── Display helpers ─────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
}
