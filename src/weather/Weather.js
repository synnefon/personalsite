import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/weather.css";
import { fetchForecast, geocodePlace, geolocate } from "./weatherApi";
import { buildWeatherLines } from "./weatherViz";

const STATUS_TEXT = {
  locating: "locating you...",
  prompt: "location unavailable — enter a place above",
  loading: "fetching forecast...",
};

function segStyle(s) {
  const style = {};
  if (s.color) style.color = s.color;
  if (s.bold) style.fontWeight = "bold";
  return style;
}

function WeatherDisplay({ lines }) {
  return (
    <pre className="weather-display">
      {lines.map((line, i) => (
        <div className="weather-line" key={i}>
          {line.length === 0
            ? " "
            : line.map((s, j) =>
                s.emojiW ? (
                  <span
                    key={j}
                    className="weather-emoji"
                    style={{ width: `${s.emojiW}ch` }}
                    data-tip={s.tip}
                  >
                    {s.text}
                  </span>
                ) : (
                  <span key={j} style={segStyle(s)}>
                    {s.text}
                  </span>
                )
              )}
        </div>
      ))}
    </pre>
  );
}

export default function Weather() {
  const [place, setPlace] = useState("");
  const [phase, setPhase] = useState("locating"); // locating | prompt | loading | ready | error
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const requestRef = useRef(0);

  // Run a fetch, ignoring its result if a newer request has started
  const run = async (getReport, { autofill = false } = {}) => {
    const requestId = ++requestRef.current;
    setPhase("loading");
    try {
      const result = await getReport();
      if (requestId !== requestRef.current) return;
      setReport(result);
      if (autofill) setPlace(result.location);
      setPhase("ready");
    } catch (e) {
      if (requestId !== requestRef.current) return;
      setError(e.message || "something went wrong");
      setPhase("error");
    }
  };

  // Auto-locate on mount; the user typing first wins
  useEffect(() => {
    geolocate().then(
      (coords) => {
        if (requestRef.current === 0) run(() => fetchForecast(coords), { autofill: true });
      },
      () => {
        if (requestRef.current === 0) setPhase("prompt");
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    const query = place.trim();
    if (!query) return;
    run(async () => fetchForecast(await geocodePlace(query)));
  };

  const lines = useMemo(() => (report ? buildWeatherLines(report, 2) : []), [report]);

  return (
    <div id="app-base" className="weather-colors">
      <div className="content-wrapper weather-colors">
        <div className="weather-search">
          <span className="weather-prompt">&gt;</span>
          <input
            className="weather-input"
            type="text"
            value={place}
            placeholder="somewhere, usa"
            spellCheck={false}
            aria-label="location"
            onChange={(e) => setPlace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        <div className="weather-screen">
          {phase === "ready" ? (
            <WeatherDisplay lines={lines} />
          ) : (
            <p className={`weather-status${phase === "error" ? " weather-status-error" : ""}`}>
              {phase === "error" ? `error: ${error}` : STATUS_TEXT[phase]}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
