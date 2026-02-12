import { useEffect, useState } from "react";
import type { AudioSource, NowPlayingInfo } from "../config.ts";
import { AUDIO_SOURCES, INFO_URLS } from "../config.ts";

export function useNowPlaying(hasStarted: boolean, audioSource: AudioSource) {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingInfo | null>(null);
  const [nowPlayingExpanded, setNowPlayingExpanded] = useState(true);

  useEffect(() => {
    if (!hasStarted || audioSource === AUDIO_SOURCES.REDWOOD) {
      setNowPlaying(null);
      return;
    }
    let timer: number;
    const fetchNowPlaying = async () => {
      const infoUrl = INFO_URLS[audioSource];
      try {
        const info = await fetch(infoUrl);
        const data = await info.json();
        console.log(data)
        const play = data.results?.[0];
        if (!play) return;
        if (play.play_type === "airbreak")
          setNowPlaying({
            song: "airbreak",
            artist: "",
            album: "",
            isAirbreak: true,
            station: audioSource,
          });
        else if (play.play_type === "trackplay")
          setNowPlaying({
            song: (play.song || "unknown track").toLowerCase(),
            artist: (play.artist || "unknown artist").toLowerCase(),
            album: (play.album || "").toLowerCase(),
            isAirbreak: false,
            station: audioSource,
          });
      } catch (e) {
        console.error("failed to fetch track info", e);
      }
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
