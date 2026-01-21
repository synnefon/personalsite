import { useEffect, useRef, useState } from "react";
import {
  buildHeatLut256,
  hexToHue,
  hslToHex,
} from "../colors.ts";
import { DEFAULT_HIGH, DEFAULT_LOW } from "../config.ts";

export function useColorManagement(speedRef: React.MutableRefObject<number>) {
  const [lavaLowColor, setLavaLowColor] = useState(DEFAULT_LOW);
  const [lavaHighColor, setLavaHighColor] = useState(DEFAULT_HIGH);
  const [rainbowMode, setRainbowMode] = useState(false);

  const heatLutRef = useRef<Uint32Array>(
    buildHeatLut256(DEFAULT_LOW, DEFAULT_HIGH)
  );
  const lavaLowColorRef = useRef(DEFAULT_LOW);
  const lavaHighColorRef = useRef(DEFAULT_HIGH);

  // Update heat LUT when colors change
  useEffect(() => {
    lavaLowColorRef.current = lavaLowColor;
    lavaHighColorRef.current = lavaHighColor;
    heatLutRef.current = buildHeatLut256(lavaLowColor, lavaHighColor);
  }, [lavaLowColor, lavaHighColor]);

  // Rainbow mode: drift hues over time
  const rainbowLowHueRef = useRef(0);
  const rainbowHighHueRef = useRef(0);
  const rainbowLowSpeedRef = useRef(1);
  const rainbowHighSpeedRef = useRef(1.3);
  const prevRainbow = useRef(false);

  useEffect(() => {
    if (rainbowMode && !prevRainbow.current) {
      // Start from current colors
      rainbowLowHueRef.current = hexToHue(lavaLowColor);
      rainbowHighHueRef.current = hexToHue(lavaHighColor);
      // Random drift speeds: 0.5x to 2x base rate
      rainbowLowSpeedRef.current = 0.5 + Math.random() * 1.5;
      rainbowHighSpeedRef.current = 0.5 + Math.random() * 1.5;
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
        (rainbowLowHueRef.current + base * s * norm * rainbowLowSpeedRef.current) % 360;
      rainbowHighHueRef.current =
        (rainbowHighHueRef.current + base * s * norm * rainbowHighSpeedRef.current) % 360;
      setLavaLowColor(hslToHex(rainbowLowHueRef.current, 1, 0.5));
      setLavaHighColor(hslToHex(rainbowHighHueRef.current, 1, 0.5));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [rainbowMode, speedRef]);

  return {
    lavaLowColor,
    setLavaLowColor,
    lavaHighColor,
    setLavaHighColor,
    rainbowMode,
    setRainbowMode,
    heatLutRef,
  };
}
