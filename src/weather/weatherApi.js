// Data layer for the weather page: browser geolocation, place-name
// geocoding (Nominatim), and NWS forecast fetching.

const NWS_POINTS = "https://api.weather.gov/points";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OPEN_METEO_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality";

async function getJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`request failed (${resp.status})`);
  return resp.json();
}

export function geolocate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      reject,
      { timeout: 8000, maximumAge: 600000 }
    );
  });
}

export async function geocodePlace(place) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(place)}&format=json&limit=1`;
  let results;
  try {
    results = await getJson(url);
  } catch {
    throw new Error(`could not geocode '${place}'`);
  }
  if (!results.length) throw new Error(`could not geocode '${place}'`);
  return { lat: Number(results[0].lat), lon: Number(results[0].lon) };
}

async function fetchHourly(url) {
  try {
    return await getJson(url);
  } catch {
    throw new Error("the forecast fetch failed — try again in a moment");
  }
}

// Current US AQI from Open-Meteo (keyless); null if unavailable
async function fetchAqi({ lat, lon }) {
  try {
    const data = await getJson(
      `${OPEN_METEO_AQ}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=us_aqi`
    );
    const aqi = data.current?.us_aqi;
    return typeof aqi === "number" ? Math.round(aqi) : null;
  } catch {
    return null;
  }
}

export async function fetchForecast({ lat, lon }) {
  let points;
  try {
    points = await getJson(`${NWS_POINTS}/${lat.toFixed(4)},${lon.toFixed(4)}`);
  } catch {
    throw new Error("only supports USA weather forecasts for the time being :(");
  }

  const rel = points.properties.relativeLocation;
  const [relLon, relLat] = rel.geometry.coordinates;

  const [hourly, aqi] = await Promise.all([
    fetchHourly(points.properties.forecastHourly),
    fetchAqi({ lat, lon }),
  ]);

  const periods = hourly.properties.periods;
  const first = periods[0];
  return {
    location: `${rel.properties.city}, ${rel.properties.state}`,
    coords: `${relLat.toFixed(4)}, ${relLon.toFixed(4)}`,
    aqi,
    current: {
      temp: first.temperature,
      cond: first.shortForecast ?? "",
      precip: first.probabilityOfPrecipitation?.value ?? 0,
    },
    periods,
  };
}
