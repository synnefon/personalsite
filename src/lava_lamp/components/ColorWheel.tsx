import React from "react";
import { hexToHsl, hslToRgb } from "../colors.ts";

interface ColorWheelProps {
  wheelType: "hot" | "cool";
  color: string;
  onColorChange: (color: string) => void;
  label: string;
  rainbowMode: boolean;
  onMouseDown: () => void;
  draggingWheel: "hot" | "cool" | null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

export default function ColorWheel({
  wheelType,
  color,
  onColorChange,
  label,
  rainbowMode,
  onMouseDown,
  draggingWheel,
}: ColorWheelProps) {
  const rgb = hexToRgb(color);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (rainbowMode || draggingWheel) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const x = e.clientX - rect.left - centerX;
    const y = e.clientY - rect.top - centerY;
    const angle = Math.atan2(y, x);
    const hue = ((angle / (2 * Math.PI)) % 1 + 1) % 1;
    const { r, g, b } = hslToRgb(hue, 1.0, 0.5);
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    onColorChange(hex);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <div
        data-wheel={wheelType}
        style={{
          position: "relative",
          width: "80px",
          height: "80px",
          cursor: rainbowMode ? "not-allowed" : "pointer",
          opacity: rainbowMode ? 0.5 : 1,
        }}
        onClick={handleClick}
        onMouseDown={(e) => {
          if (rainbowMode) return;
          onMouseDown();
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background:
              "conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)",
            WebkitMask: "radial-gradient(circle, transparent 35%, black 35%)",
            mask: "radial-gradient(circle, transparent 35%, black 35%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${50 + 37 * Math.cos(hexToHsl(color).h * 2 * Math.PI)}%`,
            top: `${50 + 37 * Math.sin(hexToHsl(color).h * 2 * Math.PI)}%`,
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            backgroundColor: color,
            border: "2px solid white",
            boxShadow: "0 0 4px rgba(0,0,0,0.5)",
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>
      <div style={{ fontSize: "13px" }}>{label}</div>
      <div style={{ fontSize: "11px", opacity: 0.7, fontFamily: "monospace" }}>
        {String(rgb.r).padStart(3, "0")} / {String(rgb.g).padStart(3, "0")} / {String(rgb.b).padStart(3, "0")}
      </div>
    </div>
  );
}
