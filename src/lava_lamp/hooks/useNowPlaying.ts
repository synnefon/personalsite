import { useEffect, useState } from "react";
import { AUDIO_SOURCES } from "../config.ts";
import type { AudioSource } from "../config.ts";

interface NowPlayingInfo {
  song: string;
  artist: string;
  album: string;
  isAirbreak: boolean;
}

export function useNowPlaying(hasStarted: boolean, audioSource: AudioSource) {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingInfo | null>(null);
  const [nowPlayingExpanded, setNowPlayingExpanded] = useState(true);

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

  return {
    nowPlaying,
    nowPlayingExpanded,
    setNowPlayingExpanded,
  };
}
