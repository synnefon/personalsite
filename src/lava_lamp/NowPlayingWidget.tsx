import React, { type ReactElement, useEffect, useRef, useState } from "react";
import { NowPlayingInfo } from "./config.ts";
import { AUDIO_SOURCE_CONFIG } from "./audioConfig.ts";

interface NowPlayingWidgetProps {
  nowPlaying: NowPlayingInfo | null;
  displayWaveform: number[];
  expanded: boolean;
  onToggle: () => void;
}

export default function NowPlayingWidget({
  nowPlaying,
  displayWaveform,
  expanded,
  onToggle,
}: NowPlayingWidgetProps): ReactElement | null {
  const nowPlayingSongRef = useRef<HTMLDivElement>(null);
  const nowPlayingArtistRef = useRef<HTMLDivElement>(null);
  const nowPlayingAlbumRef = useRef<HTMLDivElement>(null);
  const [songOverflowing, setSongOverflowing] = useState(false);
  const [artistOverflowing, setArtistOverflowing] = useState(false);
  const [albumOverflowing, setAlbumOverflowing] = useState(false);

  // Check for text overflow and apply scrolling class
  useEffect(() => {
    const SCROLL_SPEED = 30; // pixels per second (slower = more readable)

    const calculateScrollDuration = (textWidth: number): number => {
      return textWidth / SCROLL_SPEED;
    };

    const calculateSecondCopyDelay = (): number => {
      return 1.0;
    };

    // Helper for checking overflow on a single ref, calling the correct setter
    function handleOverflowCheck(
      elementRef: React.RefObject<HTMLDivElement>,
      setOverflowing: React.Dispatch<React.SetStateAction<boolean>>
    ) {
      if (!elementRef.current) return;
      const wrapper = elementRef.current.querySelector(
        ".scroll-wrapper"
      ) as HTMLElement;
      const containerWidth = elementRef.current.clientWidth;
      const isOverflowing = wrapper && wrapper.scrollWidth > containerWidth;
      setOverflowing(!!isOverflowing);

      if (isOverflowing && wrapper) {
        const duration = calculateScrollDuration(wrapper.scrollWidth);
        const delayFraction = calculateSecondCopyDelay();
        elementRef.current.style.setProperty(
          "--scroll-duration",
          `${duration}s`
        );
        elementRef.current.style.setProperty(
          "--second-copy-delay",
          `${delayFraction}`
        );
        elementRef.current.classList.add("overflowing");
      } else {
        elementRef.current.classList.remove("overflowing");
      }
    }

    // Check all overflow states in a single pass
    function checkAllOverflow() {
      handleOverflowCheck(
        nowPlayingSongRef as React.RefObject<HTMLDivElement>,
        setSongOverflowing
      );
      handleOverflowCheck(
        nowPlayingArtistRef as React.RefObject<HTMLDivElement>,
        setArtistOverflowing
      );
      handleOverflowCheck(
        nowPlayingAlbumRef as React.RefObject<HTMLDivElement>,
        setAlbumOverflowing
      );
    }

    checkAllOverflow();
    window.addEventListener("resize", checkAllOverflow);

    return () => window.removeEventListener("resize", checkAllOverflow);
  }, [nowPlaying, expanded]);

  if (!nowPlaying) {
    return null;
  }

  const handleSongClick = () => {
    const homepageUrl = AUDIO_SOURCE_CONFIG[nowPlaying.station].homepage || "";
    window.open(homepageUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className={`lava-lamp-now-playing ${expanded ? "expanded" : "collapsed"}`}
    >
      <button
        type="button"
        className="lava-lamp-now-playing-toggle"
        onClick={onToggle}
        aria-label={expanded ? "Collapse now playing" : "Expand now playing"}
      >
        {expanded ? ">" : "<"}
      </button>
      <div className="lava-lamp-now-playing-content">
        <div className="lava-lamp-now-playing-header">
          <div className="lava-lamp-now-playing-label">{nowPlaying.station}</div>
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
        <div
          ref={nowPlayingSongRef}
          className="lava-lamp-now-playing-song"
          onClick={handleSongClick}
          style={{ cursor: 'var(--pointer)' }}
          title="see station homepage"
        >
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
  );
}
