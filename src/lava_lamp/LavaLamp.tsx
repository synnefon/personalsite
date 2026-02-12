import {
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import powerIcon from "../assets/lavaLamp/power.svg";
import "../styles/lavalamp.css";
import NowPlayingWidget from "./NowPlayingWidget.tsx";
import ControlsMenu from "./components/ControlsMenu.tsx";
import { AudioSource, detectMobile } from "./config.ts";
import { indexToSpeed } from "./helpers.ts";
import { useAudioManagement } from "./hooks/useAudioManagement.ts";
import { useColorManagement } from "./hooks/useColorManagement.ts";
import { useFullscreen } from "./hooks/useFullscreen.ts";
import { useNowPlaying } from "./hooks/useNowPlaying.ts";
import { usePointerHandling } from "./hooks/usePointerHandling.ts";
import { useSimulation } from "./hooks/useSimulation.ts";

export default function LavaLamp(): ReactElement {
  const isMobile = detectMobile();

  // Core refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // State
  const [hasStarted, setHasStarted] = useState(false);

  // Speed control
  const defaultSpeedIdx = 5;
  const [speedIdx, setSpeedIdx] = useState<number>(defaultSpeedIdx);
  const speedRef = useRef<number>(indexToSpeed(defaultSpeedIdx));

  useEffect(() => {
    speedRef.current = indexToSpeed(speedIdx);
  }, [speedIdx]);

  // Audio management hook
  const {
    audioSource,
    setAudioSource,
    volume,
    setVolume,
    gameMusic,
    displayWaveform,
    playClick,
    resumeMusicFromSavedTime,
    updateWaveform,
    initializeAmplitudeAnalyzer,
    resumeAmplitudeAnalyzer,
  } = useAudioManagement(hasStarted);

  // Color management hook
  const {
    lavaLowColor,
    setLavaLowColor,
    lavaHighColor,
    setLavaHighColor,
    rainbowMode,
    setRainbowMode,
    spectrumMode,
    setSpectrumMode,
    heatLutRef,
  } = useColorManagement(speedRef);

  // Pointer handling hook
  const { pointerDownRef, pointerCoolingRef, pointerPosRef } =
    usePointerHandling(canvasRef);

  // Simulation hook
  const { particlesRef, sizeRef, imageRef, startSimulation } = useSimulation({
    canvasRef,
    ctxRef,
    pointerDownRef,
    pointerCoolingRef,
    pointerPosRef,
    speedRef,
    heatLutRef,
    updateWaveform,
  });

  // Fullscreen hook
  const { isFullscreen, toggleFullscreen } = useFullscreen({
    canvasRef,
    particlesRef,
    sizeRef,
    imageRef,
  });

  // Now playing hook
  const { nowPlaying, nowPlayingExpanded, setNowPlayingExpanded } =
    useNowPlaying(hasStarted, audioSource);

  // Update document title with song info
  useEffect(() => {
    if (nowPlaying && !nowPlaying.isAirbreak) {
      document.title = `${nowPlaying.song} - ${nowPlaying.artist}`;
    } else {
      document.title = "connor.lava-lamp-radio";
    }
  }, [nowPlaying]);

  // Start lamp
  const startLamp = useCallback(async () => {
    playClick();
    if (!hasStarted) {
      setHasStarted(true);
      startSimulation();
      initializeAmplitudeAnalyzer();
    }
    resumeAmplitudeAnalyzer();
    if (audioSource === AudioSource.forest) resumeMusicFromSavedTime();
    gameMusic.volume = 1.0;
    if (gameMusic.readyState < 3) {
      gameMusic.load();
      const onCanPlay = async () => {
        try {
          await gameMusic.play();
        } catch { }
        gameMusic.removeEventListener("canplaythrough", onCanPlay);
      };
      gameMusic.addEventListener("canplaythrough", onCanPlay, { once: true });
    } else {
      try {
        await gameMusic.play();
      } catch { }
    }
  }, [
    playClick,
    hasStarted,
    startSimulation,
    initializeAmplitudeAnalyzer,
    resumeAmplitudeAnalyzer,
    audioSource,
    resumeMusicFromSavedTime,
    gameMusic,
  ]);

  // Initial canvas size
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
        <ControlsMenu
          speedIdx={speedIdx}
          setSpeedIdx={setSpeedIdx}
          volume={volume}
          setVolume={setVolume}
          audioSource={audioSource}
          setAudioSource={setAudioSource}
          lavaLowColor={lavaLowColor}
          setLavaLowColor={setLavaLowColor}
          lavaHighColor={lavaHighColor}
          setLavaHighColor={setLavaHighColor}
          rainbowMode={rainbowMode}
          setRainbowMode={setRainbowMode}
          spectrumMode={spectrumMode}
          setSpectrumMode={setSpectrumMode}
          isFullscreen={isFullscreen}
          toggleFullscreen={toggleFullscreen}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
