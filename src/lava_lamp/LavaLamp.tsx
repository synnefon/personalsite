import React, {
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "../styles/lavalamp.css";

// @ts-expect-error - Asset import
import musicAudioNoise from "../assets/lavaLamp/guitar.mp3";
// @ts-expect-error - Asset import
import clickAudioNoise from "../assets/lavaLamp/click.mp3";
// @ts-expect-error - Asset import
import powerIcon from "../assets/lavaLamp/power.svg";

import { PersonalAudio } from "../util/Audio";
import { AudioAmplitudeAnalyzer } from "../util/audioAmplitude.ts";
import NowPlayingWidget from "./NowPlayingWidget.tsx";
import { buildHeatLut256, hexToHue, hslToHex } from "./utils/colorUtils.ts";
import {
  AUDIO_SOURCES,
  DEFAULT_HIGH,
  DEFAULT_LOW,
  FIXED_MS,
  MAX_CATCHUP_STEPS,
  SIM,
  SPEED,
} from "./utils/constants.ts";
import { detectMobile } from "./utils/deviceDetection.ts";
import {
  clampAllToBounds,
  computeParticleCount,
  createParticles,
  stepSimulationOnePairPass,
} from "./utils/physics.ts";
import { renderFrame } from "./utils/rendering.ts";
import { ensureGrid } from "./utils/spatialGrid.ts";
import {
  clampInt,
  indexToSpeed,
  speedToNearestIndex,
} from "./utils/speedUtils.ts";
import {
  readSavedMusicTimeSeconds,
  writeSavedMusicTimeSeconds,
} from "./utils/storage.ts";
import type {
  AudioSource,
  Particle,
  SpatialGrid,
  Vec2,
} from "./utils/types.ts";

// Audio source config for select
const AUDIO_SOURCE_CONFIG = {
  [AUDIO_SOURCES.REDWOOD]: {
    label: "redwood meditation",
    url: musicAudioNoise,
  },
  [AUDIO_SOURCES.KEXP]: {
    label: "kexp",
    url: "https://kexp.streamguys1.com/kexp160.aac",
  },
} as const;

export default function LavaLamp(): ReactElement {
  const isMobile = detectMobile();

  // --- Core Refs/State ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef<number | null>(null);

  const particlesRef = useRef<Particle[]>([]);
  const imageRef = useRef<ImageData | null>(null);
  const neighborCountsRef = useRef<Uint16Array>(new Uint16Array(0));
  const particleCountRef = useRef<number | null>(null);
  const gridRef = useRef<SpatialGrid | null>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 });

  const [audioSource, setAudioSource] = useState<AudioSource>(
    AUDIO_SOURCES.KEXP
  );

  // Audio setup
  const gameMusic = useMemo(() => {
    const audio = new PersonalAudio(
      AUDIO_SOURCE_CONFIG[AUDIO_SOURCES.KEXP].url,
      true
    );
    audio.preload = "auto";
    return audio;
  }, []);
  const clickSound = useMemo(
    () => new PersonalAudio(clickAudioNoise, false),
    []
  );

  const [hasStarted, setHasStarted] = useState(false);
  const pointerDownRef = useRef(false);
  const pointerCoolingRef = useRef(false);
  const pointerPosRef = useRef<Vec2>({ x: 0, y: 0 });

  // --- Audio Amplitude ---
  const amplitudeAnalyzerRef = useRef<AudioAmplitudeAnalyzer | null>(null);
  const currentWaveformRef = useRef<number[]>(Array(10).fill(0));
  const [displayWaveform, setDisplayWaveform] = useState<number[]>(
    Array(10).fill(0)
  );
  const waveformUpdateCounterRef = useRef(0);

  // --- Controls UI State ---
  const defaultSpeedIdx = useMemo(() => speedToNearestIndex(SPEED.DEFAULT), []);
  const [speedIdx, setSpeedIdx] = useState<number>(defaultSpeedIdx);
  const speedRef = useRef<number>(SPEED.DEFAULT);

  useEffect(() => {
    speedRef.current = indexToSpeed(speedIdx);
  }, [speedIdx]);

  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);
  const menuRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Fullscreen listener (simplified) ---
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
      document.body.classList.toggle(
        "lava-lamp-fullscreen",
        !!document.fullscreenElement
      );

      // Also resize canvas (only if present)
      const canvas = canvasRef.current;
      if (canvas) {
        const w = window.innerWidth,
          h = window.innerHeight;
        canvas.width = w;
        canvas.height = h;
        sizeRef.current = { w, h };
        imageRef.current = null;
        particlesRef.current && clampAllToBounds(particlesRef.current, w, h);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.body.classList.remove("lava-lamp-fullscreen");
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  // --- Menu outside click handler (short) ---
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const [volume, setVolume] = useState(1.0);
  useEffect(() => {
    gameMusic.volume = volume;
  }, [volume, gameMusic]);

  const [nowPlaying, setNowPlaying] = useState<{
    song: string;
    artist: string;
    album: string;
    isAirbreak: boolean;
  } | null>(null);
  const [nowPlayingExpanded, setNowPlayingExpanded] = useState(true);

  // --- AudioSource change handler ---
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const config = AUDIO_SOURCE_CONFIG[audioSource];
    const wasPlaying = gameMusic.isPlaying();
    if (wasPlaying) gameMusic.pause();
    gameMusic.src = config.url;
    gameMusic.load();
    if (wasPlaying) {
      const onPlay = () => {
        gameMusic.play().catch(() => {});
        gameMusic.removeEventListener("canplaythrough", onPlay);
      };
      gameMusic.addEventListener("canplaythrough", onPlay, { once: true });
    }
  }, [audioSource, gameMusic]);

  // --- KEXP Now Playing Poll ---
  useEffect(() => {
    if (!hasStarted || audioSource !== AUDIO_SOURCES.KEXP) {
      setNowPlaying(null);
      return;
    }
    let timer: number;
    const fetchNowPlaying = async () => {
      try {
        const data = await (
          await fetch("https://api.kexp.org/v2/plays/?limit=5")
        ).json();
        const play = data.results?.[0];
        if (!play) return;
        if (play.play_type === "airbreak")
          setNowPlaying({
            song: "airbreak",
            artist: "",
            album: "",
            isAirbreak: true,
          });
        else if (play.play_type === "trackplay")
          setNowPlaying({
            song: (play.song || "unknown track").toLowerCase(),
            artist: (play.artist || "unknown artist").toLowerCase(),
            album: (play.album || "unknown album").toLowerCase(),
            isAirbreak: false,
          });
      } catch {}
    };
    fetchNowPlaying();
    timer = window.setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(timer);
  }, [hasStarted, audioSource]);

  // --- Lava Colors/Heat LUT ---
  const [lavaLowColor, setLavaLowColor] = useState(DEFAULT_LOW);
  const [lavaHighColor, setLavaHighColor] = useState(DEFAULT_HIGH);
  const [rainbowMode, setRainbowMode] = useState(false);
  const heatLutRef = useRef<Uint32Array>(
    buildHeatLut256(DEFAULT_LOW, DEFAULT_HIGH)
  );
  const lavaLowColorRef = useRef(DEFAULT_LOW);
  const lavaHighColorRef = useRef(DEFAULT_HIGH);

  useEffect(() => {
    lavaLowColorRef.current = lavaLowColor;
    lavaHighColorRef.current = lavaHighColor;
    heatLutRef.current = buildHeatLut256(lavaLowColor, lavaHighColor);
  }, [lavaLowColor, lavaHighColor]);

  // --- Canvas initial mount setup (context, size) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = window.innerWidth,
      h = window.innerHeight;
    sizeRef.current = { w, h };
    canvas.width = w;
    canvas.height = h;
    ctxRef.current = canvas.getContext("2d");
    imageRef.current = null;
  }, []);

  // --- Particles initialization ---
  const initializeParticlesOnce = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (particleCountRef.current === null)
      particleCountRef.current = computeParticleCount(w, h);
    const count = particleCountRef.current;
    particlesRef.current = createParticles(w, h, count);
    neighborCountsRef.current = new Uint16Array(count);
    ensureGrid(gridRef, w, h, count, SIM.COHESION_RADIUS);
  }, []);

  // --- Music position saving ---
  const saveMusicPosition = useCallback(() => {
    writeSavedMusicTimeSeconds(gameMusic.currentTime ?? 0);
  }, [gameMusic]);

  useEffect(() => {
    if (!hasStarted) return;
    const id = window.setInterval(saveMusicPosition, 1000);
    const onPageHide = () => saveMusicPosition();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveMusicPosition();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasStarted, saveMusicPosition]);

  // --- Global cleanup on unmount ---
  useEffect(
    () => () => {
      saveMusicPosition();
      gameMusic.pause();
      gameMusic.volume = 0;
      gameMusic.reset();
      clickSound.pause();
      clickSound.volume = 0;
      clickSound.reset();
      amplitudeAnalyzerRef.current?.disconnect();
      amplitudeAnalyzerRef.current = null;
    },
    [gameMusic, clickSound, saveMusicPosition]
  );

  // --- Core animation/update ---
  const updateOnce = useCallback(() => {
    const g = gridRef.current,
      { w, h } = sizeRef.current;
    if (!g) return;
    stepSimulationOnePairPass(
      particlesRef.current,
      w,
      h,
      pointerDownRef.current,
      pointerPosRef.current,
      neighborCountsRef.current,
      speedRef.current,
      g,
      pointerCoolingRef.current
    );
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current,
      ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    renderFrame(
      ctx,
      canvas,
      particlesRef.current,
      imageRef,
      heatLutRef.current
    );
  }, []);

  const clockRef = useRef<{ last: number; acc: number }>({ last: 0, acc: 0 });
  const animate = useCallback(
    (now: number) => {
      const clock = clockRef.current;
      if (!clock.last) clock.last = now;
      let delta = now - clock.last;
      clock.last = now;
      clock.acc += Math.min(250, Math.max(0, delta));
      let steps = 0;
      while (clock.acc >= FIXED_MS && steps < MAX_CATCHUP_STEPS) {
        updateOnce();
        clock.acc -= FIXED_MS;
        steps++;
      }
      if (clock.acc >= FIXED_MS) clock.acc = 0;

      // Waveform animation, update every 5 frames
      if (amplitudeAnalyzerRef.current) {
        currentWaveformRef.current =
          amplitudeAnalyzerRef.current.getWaveformBars(10);
        if (++waveformUpdateCounterRef.current >= 5) {
          setDisplayWaveform(currentWaveformRef.current);
          waveformUpdateCounterRef.current = 0;
        }
      }
      draw();
      rafRef.current = requestAnimationFrame(animate);
    },
    [draw, updateOnce]
  );

  // --- Rainbow mode: drift hues over time ---
  const rainbowLowHueRef = useRef(0),
    rainbowHighHueRef = useRef(0);
  const prevRainbow = useRef(false);
  useEffect(() => {
    if (rainbowMode && !prevRainbow.current) {
      rainbowLowHueRef.current = hexToHue(lavaLowColor);
      rainbowHighHueRef.current = hexToHue(lavaHighColor);
    }
    prevRainbow.current = rainbowMode;
  }, [rainbowMode, lavaLowColor, lavaHighColor]);
  useEffect(() => {
    if (!rainbowMode) return;
    let id: number,
      lastT = performance.now();
    const tick = (now: number) => {
      const dt = now - lastT;
      lastT = now;
      const s = speedRef.current,
        norm = dt / 16.67,
        base = 0.02;
      rainbowLowHueRef.current =
        (rainbowLowHueRef.current + base * s * norm) % 360;
      rainbowHighHueRef.current =
        (rainbowHighHueRef.current + base * s * norm * 1.3) % 360;
      setLavaLowColor(hslToHex(rainbowLowHueRef.current, 1, 0.5));
      setLavaHighColor(hslToHex(rainbowHighHueRef.current, 1, 0.5));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [rainbowMode]);

  // --- Pointer handling (all-in-one) ---
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const toLocal = (e: PointerEvent) => {
      const rect = c.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      pointerDownRef.current = true;
      pointerCoolingRef.current =
        e.button === 2 || (e.button === 0 && e.ctrlKey);
      pointerPosRef.current = toLocal(e);
    };
    const onMove = (e: PointerEvent) => (pointerPosRef.current = toLocal(e));
    const onUp = () => {
      pointerDownRef.current = false;
      pointerCoolingRef.current = false;
    };
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // --- Utility: play click and resume saved music time ---
  const playClick = useCallback(() => {
    try {
      clickSound.volume = 1;
      clickSound.currentTime = 0;
      clickSound.reset();
      clickSound.play();
    } catch {}
  }, [clickSound]);

  const resumeMusicFromSavedTime = useCallback(() => {
    const t = readSavedMusicTimeSeconds();
    try {
      const dur = (gameMusic as any).duration;
      gameMusic.currentTime =
        typeof dur === "number" && Number.isFinite(dur) && dur > 0
          ? t % dur
          : t;
    } catch {}
  }, [gameMusic]);

  // --- Lamp startup: ensures only start+init triggers once, handles audio ---
  const startLamp = useCallback(async () => {
    playClick();
    if (!hasStarted) {
      setHasStarted(true);
      initializeParticlesOnce();
      clockRef.current = { last: 0, acc: 0 };
      requestAnimationFrame(() => draw());
      rafRef.current = requestAnimationFrame(animate);

      // AudioAmplitudeAnalyzer
      if (!amplitudeAnalyzerRef.current) {
        const analyzer = new AudioAmplitudeAnalyzer();
        if (analyzer.connect(gameMusic))
          amplitudeAnalyzerRef.current = analyzer;
      }
    }
    amplitudeAnalyzerRef.current?.resume();
    if (audioSource !== AUDIO_SOURCES.KEXP) resumeMusicFromSavedTime();
    gameMusic.volume = 1.0;
    if (gameMusic.readyState < 3) {
      gameMusic.load();
      const onCanPlay = async () => {
        try {
          await gameMusic.play();
        } catch {}
        gameMusic.removeEventListener("canplaythrough", onCanPlay);
      };
      gameMusic.addEventListener("canplaythrough", onCanPlay, { once: true });
    } else {
      try {
        await gameMusic.play();
      } catch {}
    }
  }, [
    animate,
    audioSource,
    draw,
    gameMusic,
    hasStarted,
    initializeParticlesOnce,
    playClick,
    resumeMusicFromSavedTime,
  ]);

  // --- Render ---
  const lastSpeedIdx = SPEED.STEPS - 1;
  const initialCanvasSize = useMemo(
    () => ({
      w: window.innerWidth,
      h: window.innerHeight,
    }),
    []
  );

  return (
    <div className="lava-lamp-container">
      <canvas
        ref={canvasRef}
        className="lava-lamp-canvas"
        width={initialCanvasSize.w}
        height={initialCanvasSize.h}
      />
      <NowPlayingWidget
        nowPlaying={nowPlaying}
        displayWaveform={displayWaveform}
        expanded={nowPlayingExpanded}
        onToggle={() => setNowPlayingExpanded((v) => !v)}
      />
      {!hasStarted ? (
        <div className="lava-lamp-start-overlay">
          <button
            type="button"
            className="lava-lamp-start"
            onClick={startLamp}
            aria-label="Start lava lamp radio"
          >
            <img src={powerIcon} alt="Power" className="lava-lamp-start-icon" />
          </button>
        </div>
      ) : (
        <div className="lava-lamp-controls" ref={menuRef}>
          <button
            type="button"
            className="lava-lamp-menu-toggle"
            onClick={toggleMenu}
            aria-label={menuOpen ? "Hide menu" : "Show menu"}
            aria-pressed={menuOpen}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
          {menuOpen && (
            <div className="lava-lamp-menu">
              {/* Speed */}
              <div className="lava-lamp-control-block">
                <div className="lava-lamp-control-header">
                  <div className="lava-lamp-control-title">
                    speed: {speedIdx}
                  </div>
                </div>
                <div className="lava-lamp-slider-wrap">
                  <input
                    className="lava-lamp-slider"
                    type="range"
                    min={0}
                    max={lastSpeedIdx}
                    step={1}
                    value={speedIdx}
                    onChange={(e) =>
                      setSpeedIdx(clampInt(+e.target.value, 0, lastSpeedIdx))
                    }
                    aria-label="Simulation speed"
                  />
                </div>
              </div>
              {/* Volume */}
              <div className="lava-lamp-control-block">
                <div className="lava-lamp-control-header">
                  <div className="lava-lamp-control-title">
                    volume: {Math.round(volume * 100)}%
                  </div>
                </div>
                <div className="lava-lamp-slider-wrap">
                  <input
                    className="lava-lamp-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(+e.target.value)}
                    aria-label="Music volume"
                  />
                </div>
              </div>
              {/* Audio Source */}
              <div className="lava-lamp-control-block">
                <div className="lava-lamp-control-header">
                  <div className="lava-lamp-control-title">audio source</div>
                </div>
                <div className="lava-lamp-slider-wrap">
                  <select
                    className="lava-lamp-slider"
                    value={audioSource}
                    onChange={(e) =>
                      setAudioSource(e.target.value as AudioSource)
                    }
                    aria-label="Audio source"
                  >
                    {Object.entries(AUDIO_SOURCE_CONFIG).map(([k, c]) => (
                      <option key={k} value={k}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Lava colors */}
              <div className="lava-lamp-control-block">
                <div className="lava-lamp-control-header">
                  <div className="lava-lamp-control-title">lava colors</div>
                </div>
                {/* Rainbow mode toggle */}
                <div
                  className="lava-lamp-slider-wrap"
                  style={{ marginBottom: 12 }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="lava-lamp-checkbox"
                      checked={rainbowMode}
                      onChange={(e) => setRainbowMode(e.target.checked)}
                    />
                    <span style={{ fontSize: 13, opacity: 0.9 }}>
                      rainbow drift mode
                    </span>
                  </label>
                </div>
                <div className="lava-lamp-color-row">
                  <label className="lava-lamp-color-label">
                    hot
                    <input
                      className="lava-lamp-color-input"
                      type="color"
                      value={lavaHighColor}
                      onChange={(e) => {
                        setLavaHighColor(e.target.value);
                        setRainbowMode(false);
                      }}
                      disabled={rainbowMode}
                      aria-label="Lava high color"
                    />
                  </label>
                  <label className="lava-lamp-color-label">
                    cool
                    <input
                      className="lava-lamp-color-input"
                      type="color"
                      value={lavaLowColor}
                      onChange={(e) => {
                        setLavaLowColor(e.target.value);
                        setRainbowMode(false);
                      }}
                      disabled={rainbowMode}
                      aria-label="Lava low color"
                    />
                  </label>
                  <button
                    type="button"
                    className="lava-lamp-color-reset"
                    onClick={() => {
                      setLavaLowColor(DEFAULT_LOW);
                      setLavaHighColor(DEFAULT_HIGH);
                      setRainbowMode(false);
                    }}
                    disabled={rainbowMode}
                  >
                    reset
                  </button>
                </div>
              </div>
              {/* Fullscreen */}
              {!isMobile && (
                <div className="lava-lamp-control-block">
                  <div className="lava-lamp-slider-wrap">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        className="lava-lamp-checkbox"
                        checked={isFullscreen}
                        onChange={toggleFullscreen}
                      />
                      <span style={{ fontSize: 13, opacity: 0.9 }}>
                        fullscreen mode
                      </span>
                    </label>
                  </div>
                </div>
              )}
              {/* Power off */}
              <div className="lava-lamp-control-block">
                <button
                  type="button"
                  className="lava-lamp-power-off"
                  onClick={() => window.location.reload()}
                  aria-label="Power off"
                >
                  <img
                    src={powerIcon}
                    alt="Power off"
                    className="lava-lamp-power-off-icon"
                  />
                  <span>power off</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
