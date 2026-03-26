import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/app.css";
import "../styles/monarchmusic.css";
import { ReactComponent as NorthAmericaMap } from "../assets/monarch/north-america.svg";
import Wip from "../projects/Wip";
import { SCALES } from "./scales";
import { createAudioContext, playDay, releaseAll, latToNote, DAYS_PER_SECOND } from "./audio";
import { fetchSightings, formatDate } from "./data";
import { SVG_W, SVG_H, TRAIL_DAYS, toMapX, toMapY } from "./map";

const SCALE = SCALES.bhairav;

export default function MonarchMusic() {
  const [windowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth <= 768;

  const [year, setYear] = useState(2021);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [activeDots, setActiveDots] = useState([]);

  const audioRef = useRef(null);
  const playingRef = useRef(false);
  const timeoutRef = useRef(null);
  const fullscreenRef = useRef(null);

  // ── Data fetching ───────────────────────────────────

  const loadYear = useCallback(async (yr) => {
    setCurrentDayIndex(0);
    setActiveDots([]);

    try {
      const cached = localStorage.getItem(`monarch-sightings-${yr}`);
      if (cached) {
        setDays(JSON.parse(cached));
        return;
      }
    } catch (_) {}

    setLoading(true);
    setDays([]);
    try {
      const grouped = await fetchSightings(yr);
      setDays(grouped);
    } catch (e) {
      console.error("Failed to fetch sightings:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadYear(year);
  }, [year, loadYear]);

  // ── Playback controls ─────────────────────────────────

  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (audioRef.current) {
      releaseAll(audioRef.current.ctx, audioRef.current.drones, audioRef.current.streaks);
    }
  }, []);

  const play = useCallback(() => {
    if (!days.length) return;

    if (!audioRef.current) {
      audioRef.current = createAudioContext();
    }
    const { ctx, compressor, drones, streaks } = audioRef.current;

    playingRef.current = true;
    setPlaying(true);
    setStarted(true);

    const step = (index) => {
      if (!playingRef.current || index >= days.length) {
        releaseAll(ctx, drones, streaks);
        stop();
        return;
      }
      setCurrentDayIndex(index);

      const daySightings = days[index].sightings;
      const schedule = playDay(ctx, compressor, drones, streaks, daySightings, index, SCALE);

      schedule.forEach(({ sighting, delayMs }) => {
        const addDot = () => {
          setActiveDots((prev) => [...prev, { ...sighting, timestamp: Date.now() }]);
        };
        if (delayMs > 0) {
          setTimeout(addDot, delayMs);
        } else {
          addDot();
        }
      });

      timeoutRef.current = setTimeout(() => step(index + 1), 1000 / DAYS_PER_SECOND);
    };

    step(currentDayIndex);
  }, [days, currentDayIndex, stop]);

  // ── Animation tick for dot fading ──────────────────────

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setActiveDots((prev) => [...prev]);
    }, 100);
    return () => clearInterval(interval);
  }, [playing]);

  // ── Enter fullscreen when playback starts ───────────────

  useEffect(() => {
    if (started && fullscreenRef.current && !document.fullscreenElement) {
      fullscreenRef.current.requestFullscreen().catch(() => {});
    }
  }, [started]);

  // ── Handle fullscreen exit (e.g. Escape) ───────────────

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && started) {
        stop();
        setStarted(false);
        setCurrentDayIndex(0);
        setActiveDots([]);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [started, stop]);

  // ── Cleanup on unmount / hot reload ───────────────────

  useEffect(() => {
    return () => {
      playingRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (audioRef.current) {
        audioRef.current.ctx.close();
        audioRef.current = null;
      }
    };
  }, []);

  // ── Render ────────────────────────────────────────────

  if (isMobile) return <Wip />;

  const currentDay = days[currentDayIndex];

  // Intro screen
  if (!started) {
    return (
      <div id="app-base" className="mm-colors">
        <div className="mm-intro">
          <h1 className="mm-title">the migration</h1>
          <p className="mm-description">
            every monarch butterfly sighting in north america, sonified.
            <br /><br />
            latitude becomes pitch.
            <br />
            longitude becomes pan.
            <br /><br />
            listen to the migration.
          </p>

          <div className="mm-controls">
            <label className="mm-label">
              year
              <select
                className="mm-select"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {Array.from({ length: new Date().getFullYear() - 2010 }, (_, i) => new Date().getFullYear() - 1 - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>

            <button
              className="mm-play-btn"
              onClick={play}
              disabled={loading || !days.length}
            >
              {loading ? "loading..." : "▶ play"}
            </button>
          </div>

          <p className="mm-credit">
            sighting data from <a href="https://journeynorth.org" target="_blank" rel="noreferrer">journey north</a>
          </p>
        </div>
      </div>
    );
  }

  // Playback screen — map fills the page
  return (
    <div id="app-base" className="mm-colors mm-fullscreen" ref={fullscreenRef}>
      {/* Overlay controls */}
      <div className="mm-overlay-top">
        <p className="mm-date">
          {currentDay ? formatDate(currentDay.date) : "\u00A0"}
        </p>
        <div className="mm-overlay-buttons">
          <button className="mm-btn" onClick={playing ? stop : play}>
            {playing ? "⏸" : "▶"}
          </button>
          <button className="mm-btn" onClick={() => {
            stop();
            setStarted(false);
            setCurrentDayIndex(0);
            setActiveDots([]);
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          }}>
            ✕
          </button>
        </div>
      </div>

      {/* Full-screen map */}
      <div className="mm-map-container">
        <NorthAmericaMap className="mm-map-bg" />
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="mm-map-dots"
        >
          {activeDots.map((dot, i) => {
            const isDroning = audioRef.current && audioRef.current.drones.has(latToNote(dot.lat, SCALE));
            const now = Date.now();

            // While droning, keep resetting the fade start time
            if (isDroning) dot.fadeStart = null;
            // Once drone stops, mark when fading begins
            if (!isDroning && !dot.fadeStart) dot.fadeStart = now;

            const fadeAgeSec = dot.fadeStart ? (now - dot.fadeStart) / 1000 : 0;
            const placeAgeSec = (now - dot.timestamp) / 1000;
            const trailSec = TRAIL_DAYS / DAYS_PER_SECOND;

            const opacity = isDroning
              ? 0.9 + 0.1 * Math.sin(now / 600)
              : Math.max(0.1, Math.pow(1 - fadeAgeSec / trailSec, 2));
            const r = 3 + 2 * Math.max(0, 1 - placeAgeSec / 0.3);
            return (
              <circle
                key={`${dot.timestamp}-${i}`}
                cx={toMapX(dot.lon)}
                cy={toMapY(dot.lat)}
                r={r}
                fill="orange"
                opacity={opacity}
              />
            );
          })}
        </svg>
      </div>

      {/* Timeline */}
      <div
        className="mm-timeline"
        /* onMouseDown={(e) => {
          const track = e.currentTarget.querySelector(".mm-timeline-track");
          const rect = track.getBoundingClientRect();
          const seek = (clientX) => {
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            setCurrentDayIndex(Math.floor(ratio * (days.length - 1)));
          };
          seek(e.clientX);
          const onMove = (ev) => seek(ev.clientX);
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        style={{ cursor: "var(--grab)" }} */
      >
        <div className="mm-timeline-track">
          <div
            className="mm-timeline-progress"
            style={{ width: `${(currentDayIndex / Math.max(days.length - 1, 1)) * 100}%` }}
          />
          <div
            className="mm-timeline-indicator"
            style={{ left: `${(currentDayIndex / Math.max(days.length - 1, 1)) * 100}%` }}
          />
          {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((label, i) => {
            const dayOfMonth = new Date(year, i, 1);
            const dayOfYear = Math.floor((dayOfMonth - new Date(year, 0, 1)) / 86400000);
            const pct = (dayOfYear / Math.max(days.length - 1, 1)) * 100;
            return (
              <div key={i} className="mm-timeline-tick" style={{ left: `${pct}%` }}>
                <span className="mm-timeline-label">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
