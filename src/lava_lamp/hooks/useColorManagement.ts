import { useEffect, useRef, useState } from "react";
import {
  hexToHue,
  hslToHex,
  hslToRgb,
  hexToHsl,
} from "../colors.ts";

// Generate random starting colors at least 35 degrees apart
function generateRandomColors(): { low: string; high: string } {
  const hue1 = Math.random();
  let hue2 = Math.random();

  // Ensure at least 35 degrees (35/360 = ~0.097) separation
  const minSeparation = 35 / 360;
  const separation = Math.abs(hue2 - hue1);
  const wrappedSeparation = 1 - separation;

  if (separation < minSeparation && wrappedSeparation < minSeparation) {
    hue2 = (hue1 + minSeparation + Math.random() * (1 - 2 * minSeparation)) % 1;
  }

  const color1 = hslToRgb(hue1, 1.0, 0.5);
  const color2 = hslToRgb(hue2, 1.0, 0.5);

  const hex1 = `#${color1.r.toString(16).padStart(2, '0')}${color1.g.toString(16).padStart(2, '0')}${color1.b.toString(16).padStart(2, '0')}`;
  const hex2 = `#${color2.r.toString(16).padStart(2, '0')}${color2.g.toString(16).padStart(2, '0')}${color2.b.toString(16).padStart(2, '0')}`;

  return { low: hex1, high: hex2 };
}

// Build heat LUT with stable direction
function buildStableHeatLut256(
  lowHex: string,
  highHex: string,
  directionRef: React.MutableRefObject<number>
): Uint32Array {
  const loHsl = hexToHsl(lowHex);
  const hiHsl = hexToHsl(highHex);
  const lut = new Uint32Array(256);

  let h0 = loHsl.h;
  let h1 = hiHsl.h;

  // Initialize or maintain direction
  if (directionRef.current === 0) {
    const diff = h1 - h0;
    const wrappedDiff = diff > 0 ? diff - 1 : diff + 1;
    directionRef.current = Math.abs(diff) < Math.abs(wrappedDiff) ? 1 : -1;
  }

  // Apply consistent direction
  if (directionRef.current === -1) {
    if (h1 > h0) {
      h0 += 1;
    } else {
      h1 += 1;
    }
  }

  for (let i = 0; i < 256; ++i) {
    const t = i / 255;
    let h = h0 + (h1 - h0) * t;
    while (h > 1) h -= 1;
    while (h < 0) h += 1;

    const s = loHsl.s + (hiHsl.s - loHsl.s) * t;
    const l = loHsl.l + (hiHsl.l - loHsl.l) * t;

    const { r, g, b } = hslToRgb(h, s, l);
    lut[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return lut;
}

const initialColors = generateRandomColors();

export function useColorManagement(speedRef: React.MutableRefObject<number>) {
  const [lavaLowColor, setLavaLowColor] = useState(initialColors.low);
  const [lavaHighColor, setLavaHighColor] = useState(initialColors.high);
  const [rainbowMode, setRainbowMode] = useState(false);

  const gradientDirectionRef = useRef<number>(0);
  const heatLutRef = useRef<Uint32Array>(
    buildStableHeatLut256(initialColors.low, initialColors.high, gradientDirectionRef)
  );
  const lavaLowColorRef = useRef(initialColors.low);
  const lavaHighColorRef = useRef(initialColors.high);

  // Update heat LUT when colors change
  useEffect(() => {
    lavaLowColorRef.current = lavaLowColor;
    lavaHighColorRef.current = lavaHighColor;
    heatLutRef.current = buildStableHeatLut256(lavaLowColor, lavaHighColor, gradientDirectionRef);
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
      // Random drift speeds: 0.5x to 2x base rate, random direction
      const lowSpeed = 0.5 + Math.random() * 1.5;
      const highSpeed = 0.5 + Math.random() * 1.5;
      const lowDirection = Math.random() < 0.5 ? 1 : -1;
      const highDirection = Math.random() < 0.5 ? 1 : -1;
      rainbowLowSpeedRef.current = lowSpeed * lowDirection;
      rainbowHighSpeedRef.current = highSpeed * highDirection;
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
