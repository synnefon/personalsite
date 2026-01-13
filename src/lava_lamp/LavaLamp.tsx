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

// Utility imports
import type { Particle, Vec2, SpatialGrid, AudioSource } from "./utils/types.ts";
import { AUDIO_SOURCES, DEFAULT_HIGH, DEFAULT_LOW, SIM, SPEED, FIXED_MS, MAX_CATCHUP_STEPS } from "./utils/constants.ts";
import { hslToHex, hexToHue, buildHeatLut256 } from "./utils/colorUtils.ts";
import { clampAllToBounds, computeParticleCount, createParticles, stepSimulationOnePairPass } from "./utils/physics.ts";
import { ensureGrid } from "./utils/spatialGrid.ts";
import { renderFrame } from "./utils/rendering.ts";
import { readSavedMusicTimeSeconds, writeSavedMusicTimeSeconds } from "./utils/storage.ts";
import { clampInt, indexToSpeed, speedToNearestIndex } from "./utils/speedUtils.ts";

// Audio source configuration (needs access to audio asset imports)
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


// Component
export default function LavaLamp(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const rafRef = useRef<number | null>(null);

  const particlesRef = useRef<Particle[]>([]);
  const imageRef = useRef<ImageData | null>(null);
  const neighborCountsRef = useRef<Uint16Array>(new Uint16Array(0));
  const particleCountRef = useRef<number | null>(null);

  const gridRef = useRef<SpatialGrid | null>(null);

  // 5) Cache dimensions ONCE (read only on page load)
  const sizeRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 });

  const [audioSource, setAudioSource] = useState<AudioSource>(
    AUDIO_SOURCES.KEXP
  );

  const gameMusic = useMemo(() => {
    // Initialize directly with KEXP stream
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
  const pointerPosRef = useRef<Vec2>({ x: 0, y: 0 });

  // Audio amplitude analysis
  const amplitudeAnalyzerRef = useRef<AudioAmplitudeAnalyzer | null>(null);
  const currentWaveformRef = useRef<number[]>(new Array(10).fill(0));
  const [displayWaveform, setDisplayWaveform] = useState<number[]>(
    new Array(10).fill(0)
  );
  const waveformUpdateCounterRef = useRef(0);

  // Speed slider state
  const defaultSpeedIdx = useMemo(() => speedToNearestIndex(SPEED.DEFAULT), []);
  const [speedIdx, setSpeedIdx] = useState<number>(defaultSpeedIdx);
  const speedRef = useRef<number>(SPEED.DEFAULT);

  useEffect(() => {
    speedRef.current = indexToSpeed(speedIdx);
  }, [speedIdx]);

  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);
  const menuRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = (): void => {
      const inFullscreen = !!document.fullscreenElement;
      setIsFullscreen(inFullscreen);

      // Add/remove body class for CSS targeting
      if (inFullscreen) {
        document.body.classList.add("lava-lamp-fullscreen");
      } else {
        document.body.classList.remove("lava-lamp-fullscreen");
      }

      // Resize canvas to match new screen size
      const canvas = canvasRef.current;
      if (!canvas) return;

      const w = window.innerWidth;
      const h = window.innerHeight;

      canvas.width = w;
      canvas.height = h;

      // Update cached size
      sizeRef.current = { w, h };

      // Reset image data to force recalculation
      imageRef.current = null;

      // Clamp existing particles to new bounds
      if (particlesRef.current) {
        clampAllToBounds(particlesRef.current, w, h);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.body.classList.remove("lava-lamp-fullscreen");
    };
  }, []);

  const toggleFullscreen = useCallback((): void => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
  const nowPlayingSongRef = useRef<HTMLDivElement>(null);
  const nowPlayingArtistRef = useRef<HTMLDivElement>(null);
  const nowPlayingAlbumRef = useRef<HTMLDivElement>(null);
  const [songOverflowing, setSongOverflowing] = useState(false);
  const [artistOverflowing, setArtistOverflowing] = useState(false);
  const [albumOverflowing, setAlbumOverflowing] = useState(false);

  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip on first render - audio is already initialized with KEXP
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const config = AUDIO_SOURCE_CONFIG[audioSource];
    const wasPlaying = gameMusic.isPlaying();

    // Pause current audio before switching
    if (wasPlaying) {
      gameMusic.pause();
    }

    gameMusic.src = config.url;
    gameMusic.load();

    if (wasPlaying) {
      const onCanPlay = () => {
        gameMusic.play().catch(() => {
          // ignore autoplay errors
        });
        gameMusic.removeEventListener("canplaythrough", onCanPlay);
      };
      gameMusic.addEventListener("canplaythrough", onCanPlay, { once: true });
    }
  }, [audioSource, gameMusic]);

  // Fetch KEXP now playing info
  useEffect(() => {
    if (!hasStarted || audioSource !== AUDIO_SOURCES.KEXP) {
      setNowPlaying(null);
      return;
    }

    const fetchNowPlaying = async () => {
      try {
        const response = await fetch("https://api.kexp.org/v2/plays/?limit=5");
        const data = await response.json();

        // Get the most recent play regardless of type
        const mostRecentPlay = data.results?.[0];

        if (!mostRecentPlay) {
          console.log("[KEXP] No plays found");
          return;
        }

        // Check if it's an airbreak
        if (mostRecentPlay.play_type === "airbreak") {
          setNowPlaying({
            song: "airbreak",
            artist: "",
            album: "",
            isAirbreak: true,
          });
        } else if (mostRecentPlay.play_type === "trackplay") {
          const newTrack = {
            song: (mostRecentPlay.song || "unknown track").toLowerCase(),
            artist: (mostRecentPlay.artist || "unknown artist").toLowerCase(),
            album: (mostRecentPlay.album || "unknown album").toLowerCase(),
            isAirbreak: false,
          };
          setNowPlaying(newTrack);
        }
      } catch (err) {
        console.log("[KEXP] Fetch error:", err);
      }
    };

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [hasStarted, audioSource]);

  // Check for text overflow and apply scrolling class
  useEffect(() => {
    const SCROLL_SPEED = 30; // pixels per second (slower = more readable)

    const calculateScrollDuration = (
      containerWidth: number,
      textWidth: number
    ): number => {
      // Distance = just the text width (text scrolls from 0% to -100%)
      return textWidth / SCROLL_SPEED;
    };

    const calculateSecondCopyDelay = (
      containerWidth: number,
      textWidth: number,
      duration: number
    ): number => {
      // Wait for Copy 1 to completely scroll off screen before starting Copy 2
      // At 100% of the animation, Copy 1 is at translateX(-100%) (fully off screen)
      // Copy 2 starts its animation just as Copy 1 loops back to the beginning
      return 1.0;
    };

    const checkOverflow = () => {
      if (nowPlayingSongRef.current) {
        const wrapper = nowPlayingSongRef.current.querySelector(
          ".scroll-wrapper"
        ) as HTMLElement;
        const containerWidth = nowPlayingSongRef.current.clientWidth;
        const isOverflowing = wrapper && wrapper.scrollWidth > containerWidth;
        setSongOverflowing(!!isOverflowing);
        if (isOverflowing && wrapper) {
          const duration = calculateScrollDuration(
            containerWidth,
            wrapper.scrollWidth
          );
          const delayFraction = calculateSecondCopyDelay(
            containerWidth,
            wrapper.scrollWidth,
            duration
          );
          nowPlayingSongRef.current.style.setProperty(
            "--scroll-duration",
            `${duration}s`
          );
          nowPlayingSongRef.current.style.setProperty(
            "--second-copy-delay",
            `${delayFraction}`
          );
          nowPlayingSongRef.current.classList.add("overflowing");
        } else {
          nowPlayingSongRef.current.classList.remove("overflowing");
        }
      }

      if (nowPlayingArtistRef.current) {
        const wrapper = nowPlayingArtistRef.current.querySelector(
          ".scroll-wrapper"
        ) as HTMLElement;
        const containerWidth = nowPlayingArtistRef.current.clientWidth;
        const isOverflowing = wrapper && wrapper.scrollWidth > containerWidth;
        setArtistOverflowing(!!isOverflowing);
        if (isOverflowing && wrapper) {
          const duration = calculateScrollDuration(
            containerWidth,
            wrapper.scrollWidth
          );
          const delayFraction = calculateSecondCopyDelay(
            containerWidth,
            wrapper.scrollWidth,
            duration
          );
          nowPlayingArtistRef.current.style.setProperty(
            "--scroll-duration",
            `${duration}s`
          );
          nowPlayingArtistRef.current.style.setProperty(
            "--second-copy-delay",
            `${delayFraction}`
          );
          nowPlayingArtistRef.current.classList.add("overflowing");
        } else {
          nowPlayingArtistRef.current.classList.remove("overflowing");
        }
      }

      if (nowPlayingAlbumRef.current) {
        const wrapper = nowPlayingAlbumRef.current.querySelector(
          ".scroll-wrapper"
        ) as HTMLElement;
        const containerWidth = nowPlayingAlbumRef.current.clientWidth;
        const isOverflowing = wrapper && wrapper.scrollWidth > containerWidth;
        setAlbumOverflowing(!!isOverflowing);
        if (isOverflowing && wrapper) {
          const duration = calculateScrollDuration(
            containerWidth,
            wrapper.scrollWidth
          );
          const delayFraction = calculateSecondCopyDelay(
            containerWidth,
            wrapper.scrollWidth,
            duration
          );
          nowPlayingAlbumRef.current.style.setProperty(
            "--scroll-duration",
            `${duration}s`
          );
          nowPlayingAlbumRef.current.style.setProperty(
            "--second-copy-delay",
            `${delayFraction}`
          );
          nowPlayingAlbumRef.current.classList.add("overflowing");
        } else {
          nowPlayingAlbumRef.current.classList.remove("overflowing");
        }
      }
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);

    return () => window.removeEventListener("resize", checkOverflow);
  }, [nowPlaying, nowPlayingExpanded]);

  const lavaLowColorRef = useRef(DEFAULT_LOW);
  const lavaHighColorRef = useRef(DEFAULT_HIGH);

  const [lavaLowColor, setLavaLowColor] = useState(DEFAULT_LOW);
  const [lavaHighColor, setLavaHighColor] = useState(DEFAULT_HIGH);
  const [rainbowMode, setRainbowMode] = useState(false);
  const rainbowLowHueRef = useRef(0);
  const rainbowHighHueRef = useRef(0);

  const heatLutRef = useRef<Uint32Array>(
    buildHeatLut256(DEFAULT_LOW, DEFAULT_HIGH)
  );

  // Rebuild LUT whenever colors change; redraw immediately if running.
  useEffect(() => {
    lavaLowColorRef.current = lavaLowColor;
    lavaHighColorRef.current = lavaHighColor;
    heatLutRef.current = buildHeatLut256(lavaLowColor, lavaHighColor);
  }, [lavaLowColor, lavaHighColor, hasStarted]);

  // 5) Cache canvas/context + dimensions (only read on initial mount)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    sizeRef.current = { w, h };

    canvas.width = w;
    canvas.height = h;

    ctxRef.current = canvas.getContext("2d");

    // ensure image data matches cached size
    imageRef.current = null;

    // no resize listener by request
  }, []);

  const initializeParticlesOnce = useCallback(() => {
    const { w, h } = sizeRef.current;

    if (particleCountRef.current === null) {
      particleCountRef.current = computeParticleCount(w, h);
    }

    const count = particleCountRef.current;
    particlesRef.current = createParticles(w, h, count);
    neighborCountsRef.current = new Uint16Array(count);

    ensureGrid(gridRef, w, h, count, SIM.COHESION_RADIUS);
  }, []);

  const saveMusicPosition = useCallback(() => {
    writeSavedMusicTimeSeconds(gameMusic.currentTime ?? 0);
  }, [gameMusic]);

  useEffect(() => {
    if (!hasStarted) return;

    const tick = () => saveMusicPosition();
    const id = window.setInterval(tick, 1000);

    const onPageHide = () => saveMusicPosition();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveMusicPosition();
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasStarted, saveMusicPosition]);

  useEffect(() => {
    return () => {
      saveMusicPosition();

      gameMusic.pause();
      gameMusic.volume = 0;
      gameMusic.reset();

      clickSound.pause();
      clickSound.volume = 0;
      clickSound.reset();

      // Cleanup amplitude analyzer
      if (amplitudeAnalyzerRef.current) {
        amplitudeAnalyzerRef.current.disconnect();
        amplitudeAnalyzerRef.current = null;
      }
    };
  }, [gameMusic, clickSound, saveMusicPosition]);

  const updateOnce = useCallback(() => {
    const g = gridRef.current;
    if (!g) return;

    const { w, h } = sizeRef.current;

    stepSimulationOnePairPass(
      particlesRef.current,
      w,
      h,
      pointerDownRef.current,
      pointerPosRef.current,
      neighborCountsRef.current,
      speedRef.current,
      g
    );
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    renderFrame(
      ctx,
      canvas,
      particlesRef.current,
      imageRef,
      heatLutRef.current
      // Grid optimization changes visual appearance - disabled for now
    );
  }, []);

  // 0) Fixed update cadence: updates happen at FIXED_FPS regardless of render speed.
  const clockRef = useRef<{ last: number; acc: number }>({ last: 0, acc: 0 });

  // Performance monitoring - only log every 10 seconds
  const perfRef = useRef({
    frameCount: 0,
    totalTime: 0,
    physicsTime: 0,
    renderTime: 0,
    otherTime: 0,
    lastLogTime: 0,
  });

  const animate = useCallback(
    (now: number) => {
      const frameStart = performance.now();

      const clock = clockRef.current;

      if (clock.last === 0) clock.last = now;
      const delta = now - clock.last;
      clock.last = now;

      // Clamp massive deltas (tab-switch etc.)
      clock.acc += Math.min(250, Math.max(0, delta));

      // Physics timing
      const physicsStart = performance.now();
      let steps = 0;
      while (clock.acc >= FIXED_MS && steps < MAX_CATCHUP_STEPS) {
        updateOnce();
        clock.acc -= FIXED_MS;
        steps++;
      }
      const physicsEnd = performance.now();

      // Drop extra backlog to avoid death spiral
      if (clock.acc >= FIXED_MS) clock.acc = 0;

      // Update audio waveform bars (update state every 5 frames for smoother, calmer animation)
      if (amplitudeAnalyzerRef.current) {
        currentWaveformRef.current =
          amplitudeAnalyzerRef.current.getWaveformBars(10);
        waveformUpdateCounterRef.current++;
        if (waveformUpdateCounterRef.current >= 5) {
          setDisplayWaveform(currentWaveformRef.current);
          waveformUpdateCounterRef.current = 0;
        }
      }

      // Rendering timing
      const renderStart = performance.now();
      draw();
      const renderEnd = performance.now();

      // Performance tracking
      const frameEnd = performance.now();
      const frameTime = frameEnd - frameStart;
      const physicsTime = physicsEnd - physicsStart;
      const renderTime = renderEnd - renderStart;
      const otherTime = frameTime - physicsTime - renderTime;

      const perf = perfRef.current;
      perf.frameCount++;
      perf.totalTime += frameTime;
      perf.physicsTime += physicsTime;
      perf.renderTime += renderTime;
      perf.otherTime += otherTime;

      // Log every 10 seconds
      if (perf.lastLogTime === 0) perf.lastLogTime = now;
      const elapsed = now - perf.lastLogTime;
      if (elapsed >= 10000) {
        const avgFrameTime = perf.totalTime / perf.frameCount;
        const avgPhysics = perf.physicsTime / perf.frameCount;
        const avgRender = perf.renderTime / perf.frameCount;
        const avgOther = perf.otherTime / perf.frameCount;
        const fps = (perf.frameCount / elapsed) * 1000;

        const physicsPercent = (avgPhysics / avgFrameTime) * 100;
        const renderPercent = (avgRender / avgFrameTime) * 100;
        const otherPercent = (avgOther / avgFrameTime) * 100;

        const canvas = canvasRef.current;
        const screenW = canvas?.width || 0;
        const screenH = canvas?.height || 0;
        const pixelSize = screenW && screenH ? Math.max(6, Math.min(24, Math.round(Math.sqrt((screenW * screenH) / 12_889)))) : 0;

        console.log("=== Performance (10s average) ===");
        console.log(`Screen: ${screenW}x${screenH} (${pixelSize}px chunks)`);
        console.log(`FPS: ${fps.toFixed(1)}`);
        console.log(`Total Frame: ${avgFrameTime.toFixed(2)}ms`);
        console.log(`  Physics: ${avgPhysics.toFixed(2)}ms (${physicsPercent.toFixed(1)}%)`);
        console.log(`  Render:  ${avgRender.toFixed(2)}ms (${renderPercent.toFixed(1)}%)`);
        console.log(`  Other:   ${avgOther.toFixed(2)}ms (${otherPercent.toFixed(1)}%)`);
        console.log("=================================");

        // Reset counters
        perf.frameCount = 0;
        perf.totalTime = 0;
        perf.physicsTime = 0;
        perf.renderTime = 0;
        perf.otherTime = 0;
        perf.lastLogTime = now;
      }

      rafRef.current = requestAnimationFrame(animate);
    },
    [draw, updateOnce]
  );

  // Initialize rainbow hues from current colors ONLY when rainbow mode is enabled
  const prevRainbowModeRef = useRef(false);
  useEffect(() => {
    // Only initialize when rainbow mode transitions from false -> true
    if (rainbowMode && !prevRainbowModeRef.current) {
      // Start rainbow from the current colors' hues
      rainbowLowHueRef.current = hexToHue(lavaLowColor);
      rainbowHighHueRef.current = hexToHue(lavaHighColor);
    }
    prevRainbowModeRef.current = rainbowMode;
  }, [rainbowMode, lavaLowColor, lavaHighColor]);

  // Rainbow mode color cycling
  useEffect(() => {
    if (!rainbowMode) return;

    let animationId: number;
    let lastTime = performance.now();

    const updateRainbowColors = (now: number) => {
      const deltaTime = now - lastTime;
      lastTime = now;

      // Speed scales from 0 (frozen) to 5 (max)
      // Rainbow speed: 0.02 degrees per frame at speed=1, scales linearly
      const baseSpeed = 0.02;
      const speed = speedRef.current;
      const normalizedDelta = deltaTime / 16.67; // normalize to ~60fps

      // Drift hot and cold independently at slightly different rates
      const lowIncrement = baseSpeed * speed * normalizedDelta;
      const highIncrement = baseSpeed * speed * normalizedDelta * 1.3; // 30% faster

      rainbowLowHueRef.current =
        (rainbowLowHueRef.current + lowIncrement) % 360;
      rainbowHighHueRef.current =
        (rainbowHighHueRef.current + highIncrement) % 360;

      const lowColor = hslToHex(rainbowLowHueRef.current, 1.0, 0.5);
      const highColor = hslToHex(rainbowHighHueRef.current, 1.0, 0.5);

      setLavaLowColor(lowColor);
      setLavaHighColor(highColor);

      animationId = requestAnimationFrame(updateRainbowColors);
    };

    animationId = requestAnimationFrame(updateRainbowColors);

    return () => cancelAnimationFrame(animationId);
  }, [rainbowMode]);

  // Pointer handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toLocal = (e: PointerEvent): Vec2 => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      pointerDownRef.current = true;
      pointerPosRef.current = toLocal(e);
    };
    const onMove = (e: PointerEvent) => {
      pointerPosRef.current = toLocal(e);
    };
    const onUp = () => {
      pointerDownRef.current = false;
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const playClick = useCallback(() => {
    try {
      clickSound.volume = 1.0;
      clickSound.currentTime = 0;
      clickSound.reset();
      clickSound.play();
    } catch {
      // ignore
    }
  }, [clickSound]);

  const resumeMusicFromSavedTime = useCallback(() => {
    const t = readSavedMusicTimeSeconds();
    try {
      const duration = (gameMusic as any).duration as number | undefined;
      if (
        typeof duration === "number" &&
        Number.isFinite(duration) &&
        duration > 0
      ) {
        gameMusic.currentTime = t % duration;
      } else {
        gameMusic.currentTime = t;
      }
    } catch {
      // ignore
    }
  }, [gameMusic]);

  const startLamp = useCallback(async () => {
    playClick();

    if (!hasStarted) {
      setHasStarted(true);
      initializeParticlesOnce();

      // reset fixed-timestep clock
      clockRef.current = { last: 0, acc: 0 };

      // draw a first frame immediately
      requestAnimationFrame(() => draw());

      // start RAF loop
      rafRef.current = requestAnimationFrame(animate);

      // Initialize amplitude analyzer
      if (!amplitudeAnalyzerRef.current) {
        const analyzer = new AudioAmplitudeAnalyzer();
        const connected = analyzer.connect(gameMusic);
        if (connected) {
          amplitudeAnalyzerRef.current = analyzer;
          console.log("[LavaLamp] Audio amplitude analyzer connected");
        } else {
          console.warn("[LavaLamp] Failed to connect audio amplitude analyzer");
        }
      }
    }

    // Resume audio context if suspended
    if (amplitudeAnalyzerRef.current) {
      amplitudeAnalyzerRef.current.resume();
    }

    // Only resume from saved time for non-streaming sources (like Redwood)
    if (audioSource !== AUDIO_SOURCES.KEXP) {
      resumeMusicFromSavedTime();
    }
    gameMusic.volume = 1.0;

    // Ensure audio is loaded before trying to play
    if (gameMusic.readyState < 3) {
      // If not enough data loaded, trigger load and wait
      gameMusic.load();

      const onCanPlay = async () => {
        try {
          await gameMusic.play();
        } catch {
          // ignore if still fails
        }
        gameMusic.removeEventListener("canplaythrough", onCanPlay);
      };
      gameMusic.addEventListener("canplaythrough", onCanPlay, { once: true });
    } else {
      // Audio already loaded, play immediately
      try {
        await gameMusic.play();
      } catch {
        // ignore autoplay errors
      }
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

  const initialCanvasSize = useMemo(
    () => ({ w: window.innerWidth, h: window.innerHeight }),
    []
  );

  const lastSpeedIdx = SPEED.STEPS - 1;

  return (
    <div className="lava-lamp-container">
      <canvas
        ref={canvasRef}
        className="lava-lamp-canvas"
        width={initialCanvasSize.w}
        height={initialCanvasSize.h}
      />

      {nowPlaying && (
        <div
          className={`lava-lamp-now-playing ${
            nowPlayingExpanded ? "expanded" : "collapsed"
          }`}
        >
          <button
            type="button"
            className="lava-lamp-now-playing-toggle"
            onClick={() => setNowPlayingExpanded(!nowPlayingExpanded)}
            aria-label={
              nowPlayingExpanded ? "Collapse now playing" : "Expand now playing"
            }
          >
            {nowPlayingExpanded ? "›" : "‹"}
          </button>
          <div className="lava-lamp-now-playing-content">
            <div className="lava-lamp-now-playing-header">
              <div className="lava-lamp-now-playing-label">kexp</div>
              {!nowPlaying.isAirbreak && (
                <div className="lava-lamp-soundwave">
                  {displayWaveform.map((height, i) => (
                    <div
                      key={i}
                      className="lava-lamp-soundwave-bar"
                      style={{ "--bar-height": height } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}
            </div>
            <div ref={nowPlayingSongRef} className="lava-lamp-now-playing-song">
              <span className="scroll-wrapper">{nowPlaying.song}</span>
              {songOverflowing && (
                <span className="scroll-wrapper second">{nowPlaying.song}</span>
              )}
            </div>
            {!nowPlaying.isAirbreak && (
              <>
                <div
                  ref={nowPlayingArtistRef}
                  className="lava-lamp-now-playing-artist"
                >
                  <span className="scroll-wrapper">{nowPlaying.artist}</span>
                  {artistOverflowing && (
                    <span className="scroll-wrapper second">
                      {nowPlaying.artist}
                    </span>
                  )}
                </div>
                <div
                  ref={nowPlayingAlbumRef}
                  className="lava-lamp-now-playing-album"
                >
                  <span className="scroll-wrapper">{nowPlaying.album}</span>
                  {albumOverflowing && (
                    <span className="scroll-wrapper second">
                      {nowPlaying.album}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
                      setSpeedIdx(
                        clampInt(Number(e.target.value), 0, lastSpeedIdx)
                      )
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
                    onChange={(e) => setVolume(Number(e.target.value))}
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
                    {Object.entries(AUDIO_SOURCE_CONFIG).map(
                      ([key, config]) => (
                        <option key={key} value={key}>
                          {config.label}
                        </option>
                      )
                    )}
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
                  style={{ marginBottom: "12px" }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="lava-lamp-checkbox"
                      checked={rainbowMode}
                      onChange={(e) => setRainbowMode(e.target.checked)}
                    />
                    <span style={{ fontSize: "13px", opacity: 0.9 }}>
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
              <div className="lava-lamp-control-block">
                <div className="lava-lamp-slider-wrap">
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="lava-lamp-checkbox"
                      checked={isFullscreen}
                      onChange={toggleFullscreen}
                    />
                    <span style={{ fontSize: "13px", opacity: 0.9 }}>
                      fullscreen mode
                    </span>
                  </label>
                </div>
              </div>

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
