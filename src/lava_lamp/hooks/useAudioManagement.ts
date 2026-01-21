import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PersonalAudio } from "../../util/Audio";
import { AudioAmplitudeAnalyzer } from "../../util/audioAmplitude.ts";
import { AUDIO_SOURCES } from "../config.ts";
import {
  readSavedMusicTimeSeconds,
  writeSavedMusicTimeSeconds,
} from "../helpers.ts";
import { AUDIO_SOURCE_CONFIG, CLICK_AUDIO_URL } from "../audioConfig.ts";
import type { AudioSource } from "../config.ts";

export function useAudioManagement(hasStarted: boolean) {
  const [audioSource, setAudioSource] = useState<AudioSource>(
    AUDIO_SOURCES.KEXP
  );
  const [volume, setVolume] = useState(1.0);

  // Audio instances
  const gameMusic = useMemo(() => {
    const audio = new PersonalAudio(
      AUDIO_SOURCE_CONFIG[AUDIO_SOURCES.KEXP].url,
      true
    );
    audio.preload = "auto";
    return audio;
  }, []);

  const clickSound = useMemo(
    () => new PersonalAudio(CLICK_AUDIO_URL, false),
    []
  );

  // Amplitude analyzer
  const amplitudeAnalyzerRef = useRef<AudioAmplitudeAnalyzer | null>(null);
  const currentWaveformRef = useRef<number[]>(Array(10).fill(0));
  const [displayWaveform, setDisplayWaveform] = useState<number[]>(
    Array(10).fill(0)
  );
  const waveformUpdateCounterRef = useRef(0);

  // Volume effect
  useEffect(() => {
    gameMusic.volume = volume;
  }, [volume, gameMusic]);

  // Audio source change handler
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

  // Music position saving
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

  // Global cleanup on unmount
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

  // Utility functions
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

  const updateWaveform = useCallback(() => {
    if (amplitudeAnalyzerRef.current) {
      currentWaveformRef.current =
        amplitudeAnalyzerRef.current.getWaveformBars(10);
      if (++waveformUpdateCounterRef.current >= 5) {
        setDisplayWaveform(currentWaveformRef.current);
        waveformUpdateCounterRef.current = 0;
      }
    }
  }, []);

  const initializeAmplitudeAnalyzer = useCallback(() => {
    if (!amplitudeAnalyzerRef.current) {
      const analyzer = new AudioAmplitudeAnalyzer();
      if (analyzer.connect(gameMusic)) amplitudeAnalyzerRef.current = analyzer;
    }
  }, [gameMusic]);

  const resumeAmplitudeAnalyzer = useCallback(() => {
    amplitudeAnalyzerRef.current?.resume();
  }, []);

  return {
    audioSource,
    setAudioSource,
    volume,
    setVolume,
    gameMusic,
    clickSound,
    displayWaveform,
    amplitudeAnalyzerRef,
    playClick,
    resumeMusicFromSavedTime,
    updateWaveform,
    initializeAmplitudeAnalyzer,
    resumeAmplitudeAnalyzer,
  };
}
