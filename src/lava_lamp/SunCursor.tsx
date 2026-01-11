import React, { useEffect, useMemo, useRef, useState } from "react";

function SunSvg({
  animated,
  sizePx = 32,
}: {
  animated: boolean;
  sizePx?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={sizePx}
      height={sizePx}
      shapeRendering="geometricPrecision"
      style={{ display: "block" }}
    >
      {/* RAY TEMPLATE */}
      <defs>
        <g id="ray">
          {/* white outline */}
          <line
            x1="64"
            y1="30"
            x2="64"
            y2="14"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* black stroke */}
          <line
            x1="64"
            y1="30"
            x2="64"
            y2="14"
            stroke="black"
            strokeWidth="4"
            strokeLinecap="round"
          >
            {animated && (
              <animate
                attributeName="y2"
                dur="0.8s"
                repeatCount="indefinite"
                calcMode="discrete"
                values="18;16;14;10;14;16;18"
              />
            )}
          </line>
        </g>
      </defs>

      {/* RAYS */}
      <g>
        {Array.from({ length: 24 }, (_, i) => (
          <use
            key={i}
            href="#ray"
            transform={`rotate(${i * 15} 64 64)`}
          />
        ))}
      </g>

      {/* CORE — white outline */}
      <circle cx="64" cy="64" r="27" fill="white" />
      {/* CORE — black fill */}
      <circle cx="64" cy="64" r="26" fill="black" />
    </svg>
  );
}

export function SunCursor({
  children,
  longPressMs = 400,
  sizePx = 32,
  hotspot = { x: 16, y: 16 },
}: {
  children: React.ReactNode;
  longPressMs?: number;
  sizePx?: number;
  hotspot?: { x: number; y: number };
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [longPress, setLongPress] = useState(false);

  const downRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const stop = () => {
      downRef.current = false;
      clearTimer();
      setLongPress(false);
    };

    const onDown = (e: PointerEvent) => {
      downRef.current = true;
      setPos({ x: e.clientX, y: e.clientY });

      clearTimer();
      timerRef.current = window.setTimeout(() => {
        if (downRef.current) setLongPress(true);
      }, longPressMs);
    };

    const onMove = (e: PointerEvent) => {
      pendingRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (pendingRef.current) setPos(pendingRef.current);
        });
      }
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);

    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      clearTimer();
    };
  }, [longPressMs]);

  const style = useMemo<React.CSSProperties>(
    () => ({
      position: "fixed",
      left: pos.x - hotspot.x,
      top: pos.y - hotspot.y,
      width: sizePx,
      height: sizePx,
      pointerEvents: "none",
      zIndex: 2147483647,
    }),
    [pos, hotspot, sizePx]
  );

  return (
    <div style={{ cursor: "none" }}>
      {children}
      <div style={style} aria-hidden>
        <SunSvg animated={longPress} sizePx={sizePx} />
      </div>
    </div>
  );
}
