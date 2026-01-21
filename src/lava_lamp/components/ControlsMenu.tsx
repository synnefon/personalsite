import React, { ReactElement, useCallback, useEffect, useRef, useState, useMemo } from "react";
import powerIcon from "../../assets/lavaLamp/power.svg";
import { AUDIO_SOURCE_CONFIG } from "../audioConfig.ts";
import { SPEED } from "../config.ts";
import { clampInt } from "../helpers.ts";
import { hexToHsl, hslToRgb } from "../colors.ts";
import type { AudioSource } from "../config.ts";
import ColorWheel from "./ColorWheel.tsx";

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
  spectrumMode: boolean;
  setSpectrumMode: (mode: boolean) => void;
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
  spectrumMode,
  setSpectrumMode,
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

  // Drag state for color wheels
  const [draggingWheel, setDraggingWheel] = useState<'hot' | 'cool' | null>(null);

  // Track gradient direction to avoid flipping
  const gradientDirectionRef = useRef<number>(0); // +1 = forward, -1 = backward, 0 = uninitialized

  const handleWheelDrag = useCallback((e: MouseEvent, wheelType: 'hot' | 'cool', wheelElement: HTMLDivElement) => {
    const rect = wheelElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = e.clientX - centerX;
    const y = e.clientY - centerY;
    const angle = Math.atan2(y, x);
    const hue = ((angle / (2 * Math.PI)) % 1 + 1) % 1;
    const { r, g, b } = hslToRgb(hue, 1.0, 0.5);
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    if (wheelType === 'hot') {
      setLavaHighColor(hex);
    } else {
      setLavaLowColor(hex);
    }
    setRainbowMode(false);
  }, [setLavaHighColor, setLavaLowColor, setRainbowMode]);

  useEffect(() => {
    if (!draggingWheel) return;

    // Set drag cursor on body while dragging
    document.body.style.cursor = "var(--grabbing)";

    const handleMouseMove = (e: MouseEvent) => {
      const wheelElement = document.querySelector(`[data-wheel="${draggingWheel}"]`) as HTMLDivElement;
      if (wheelElement) {
        handleWheelDrag(e, draggingWheel, wheelElement);
      }
    };

    const handleMouseUp = () => {
      setDraggingWheel(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Reset cursor
      document.body.style.cursor = '';
    };
  }, [draggingWheel, handleWheelDrag]);

  // Generate gradient preview (hot to cool)
  const gradientPreview = useMemo(() => {
    const stops: string[] = [];

    if (!spectrumMode) {
      // Gradient mode: simple RGB interpolation
      return `linear-gradient(to right, ${lavaHighColor}, ${lavaLowColor})`;
    }

    // Spectrum mode: HSL interpolation with stable direction
    const loHsl = hexToHsl(lavaLowColor);
    const hiHsl = hexToHsl(lavaHighColor);

    let h0 = hiHsl.h;
    let h1 = loHsl.h;

    // Initialize or maintain direction to avoid flipping
    if (gradientDirectionRef.current === 0) {
      // First time: choose shorter path
      const diff = h1 - h0;
      const wrappedDiff = diff > 0 ? diff - 1 : diff + 1;
      gradientDirectionRef.current = Math.abs(diff) < Math.abs(wrappedDiff) ? 1 : -1;
    }

    // Apply consistent direction
    if (gradientDirectionRef.current === -1) {
      // Go the "long way" around the wheel
      if (h1 > h0) {
        h0 += 1;
      } else {
        h1 += 1;
      }
    }
    // else use direct path (gradientDirectionRef.current === 1)

    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      let h = h0 + (h1 - h0) * t;
      while (h > 1) h -= 1;
      while (h < 0) h += 1;

      // Always use full saturation and medium lightness for vibrant colors
      const s = 1.0;
      const l = 0.5;

      const { r, g, b } = hslToRgb(h, s, l);
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      stops.push(`${hex} ${t * 100}%`);
    }

    return `linear-gradient(to right, ${stops.join(', ')})`;
  }, [lavaLowColor, lavaHighColor, spectrumMode]);

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
        <div className="lava-lamp-menu" style={{ maxHeight: "65vh", overflowY: "auto" }}>
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
          {/* Fullscreen */}
          {!isMobile && (
            <div className="lava-lamp-control-block">
              <div className="lava-lamp-slider-wrap">
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "var(--pointer)",
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
          {/* Lava colors */}
          <div className="lava-lamp-control-block">
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
                  cursor: "var(--pointer)",
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
            {/* Spectrum/Gradient mode toggle */}
            <div
              className="lava-lamp-slider-wrap"
              style={{ marginBottom: 12 }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "var(--pointer)",
                }}
              >
                <input
                  type="checkbox"
                  className="lava-lamp-checkbox"
                  checked={spectrumMode}
                  onChange={(e) => setSpectrumMode(e.target.checked)}
                />
                <span style={{ fontSize: 13, opacity: 0.9 }}>
                  spectrum mode
                </span>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "space-around", gap: "16px", marginBottom: "8px" }}>
              <ColorWheel
                wheelType="hot"
                color={lavaHighColor}
                onColorChange={(hex) => {
                  setLavaHighColor(hex);
                  setRainbowMode(false);
                }}
                label="hot"
                rainbowMode={rainbowMode}
                onMouseDown={() => setDraggingWheel('hot')}
                draggingWheel={draggingWheel}
              />
              <ColorWheel
                wheelType="cool"
                color={lavaLowColor}
                onColorChange={(hex) => {
                  setLavaLowColor(hex);
                  setRainbowMode(false);
                }}
                label="cool"
                rainbowMode={rainbowMode}
                onMouseDown={() => setDraggingWheel('cool')}
                draggingWheel={draggingWheel}
              />
            </div>
            <div style={{ marginTop: "8px" }}>
              <div
                style={{
                  width: "100%",
                  height: "24px",
                  background: gradientPreview,
                  borderRadius: "4px",
                }}
                title="Color gradient preview"
              />
            </div>
          </div>
          {/* Audio Source & Volume */}
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
            <div className="lava-lamp-control-header" style={{ marginTop: 12 }}>
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
