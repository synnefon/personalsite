import React, { ReactElement, useCallback, useEffect, useRef, useState } from "react";
import powerIcon from "../../assets/lavaLamp/power.svg";
import { AUDIO_SOURCE_CONFIG } from "../audioConfig.ts";
import { DEFAULT_HIGH, DEFAULT_LOW, SPEED } from "../config.ts";
import { clampInt } from "../helpers.ts";
import type { AudioSource } from "../config.ts";

interface ControlsMenuProps {
  speedIdx: number;
  setSpeedIdx: (idx: number) => void;
  volume: number;
  setVolume: (vol: number) => void;
  audioSource: AudioSource;
  setAudioSource: (source: AudioSource) => void;
  lavaLowColor: string;
  setLavaLowColor: (color: string) => void;
  lavaHighColor: string;
  setLavaHighColor: (color: string) => void;
  rainbowMode: boolean;
  setRainbowMode: (mode: boolean) => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  isMobile: boolean;
}

export default function ControlsMenu({
  speedIdx,
  setSpeedIdx,
  volume,
  setVolume,
  audioSource,
  setAudioSource,
  lavaLowColor,
  setLavaLowColor,
  lavaHighColor,
  setLavaHighColor,
  rainbowMode,
  setRainbowMode,
  isFullscreen,
  toggleFullscreen,
  isMobile,
}: ControlsMenuProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const lastSpeedIdx = SPEED.STEPS - 1;

  return (
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
              <div className="lava-lamp-control-title">speed: {speedIdx}</div>
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
                onChange={(e) => setAudioSource(e.target.value as AudioSource)}
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
  );
}
