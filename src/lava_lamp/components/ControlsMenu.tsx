import React, { ReactElement, useCallback, useEffect, useRef, useState, useMemo } from "react";
import powerIcon from "../../assets/lavaLamp/power.svg";
import { AUDIO_SOURCE_CONFIG } from "../audioConfig.ts";
import { DEFAULT_HIGH, DEFAULT_LOW, SPEED } from "../config.ts";
import { clampInt } from "../helpers.ts";
import { hexToHsl, hslToRgb } from "../colors.ts";
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

  // Generate gradient preview using HSL interpolation (hot to cool)
  const gradientPreview = useMemo(() => {
    const loHsl = hexToHsl(lavaLowColor);
    const hiHsl = hexToHsl(lavaHighColor);
    const stops: string[] = [];

    for (let i = 0; i <= 10; i++) {
      const t = i / 10;

      // Interpolate from hot (hiHsl) to cool (loHsl)
      let h0 = hiHsl.h;
      let h1 = loHsl.h;
      if (Math.abs(h1 - h0) > 0.5) {
        if (h1 > h0) {
          h0 += 1;
        } else {
          h1 += 1;
        }
      }
      let h = h0 + (h1 - h0) * t;
      if (h > 1) h -= 1;

      const s = hiHsl.s + (loHsl.s - hiHsl.s) * t;
      const l = hiHsl.l + (loHsl.l - hiHsl.l) * t;

      const { r, g, b } = hslToRgb(h, s, l);
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      stops.push(`${hex} ${t * 100}%`);
    }

    return `linear-gradient(to right, ${stops.join(', ')})`;
  }, [lavaLowColor, lavaHighColor]);

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
            <div style={{ display: "flex", justifyContent: "space-around", gap: "16px", marginBottom: "8px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    position: "relative",
                    width: "80px",
                    height: "80px",
                    cursor: rainbowMode ? "not-allowed" : "pointer",
                    opacity: rainbowMode ? 0.5 : 1,
                  }}
                  onClick={(e) => {
                    if (rainbowMode) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const x = e.clientX - rect.left - centerX;
                    const y = e.clientY - rect.top - centerY;
                    const angle = Math.atan2(y, x);
                    const hue = ((angle / (2 * Math.PI)) % 1 + 1) % 1;
                    const { r, g, b } = hslToRgb(hue, 1.0, 0.5);
                    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                    setLavaHighColor(hex);
                    setRainbowMode(false);
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: "conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: "50%",
                      height: "50%",
                      borderRadius: "50%",
                      backgroundColor: "#1a1a1a",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: `${50 + 37.5 * Math.cos(hexToHsl(lavaHighColor).h * 2 * Math.PI)}%`,
                      top: `${50 + 37.5 * Math.sin(hexToHsl(lavaHighColor).h * 2 * Math.PI)}%`,
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: lavaHighColor,
                      border: "2px solid white",
                      boxShadow: "0 0 4px rgba(0,0,0,0.5)",
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                </div>
                <div style={{ fontSize: "13px" }}>hot</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    position: "relative",
                    width: "80px",
                    height: "80px",
                    cursor: rainbowMode ? "not-allowed" : "pointer",
                    opacity: rainbowMode ? 0.5 : 1,
                  }}
                  onClick={(e) => {
                    if (rainbowMode) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const x = e.clientX - rect.left - centerX;
                    const y = e.clientY - rect.top - centerY;
                    const angle = Math.atan2(y, x);
                    const hue = ((angle / (2 * Math.PI)) % 1 + 1) % 1;
                    const { r, g, b } = hslToRgb(hue, 1.0, 0.5);
                    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                    setLavaLowColor(hex);
                    setRainbowMode(false);
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: "conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: "50%",
                      height: "50%",
                      borderRadius: "50%",
                      backgroundColor: "#1a1a1a",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: `${50 + 37.5 * Math.cos(hexToHsl(lavaLowColor).h * 2 * Math.PI)}%`,
                      top: `${50 + 37.5 * Math.sin(hexToHsl(lavaLowColor).h * 2 * Math.PI)}%`,
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: lavaLowColor,
                      border: "2px solid white",
                      boxShadow: "0 0 4px rgba(0,0,0,0.5)",
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                </div>
                <div style={{ fontSize: "13px" }}>cool</div>
              </div>
            </div>
            <div className="lava-lamp-color-row">
              <div
                style={{
                  width: "100%",
                  height: "24px",
                  background: gradientPreview,
                  borderRadius: "4px",
                }}
                title="Color gradient preview"
              />
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
