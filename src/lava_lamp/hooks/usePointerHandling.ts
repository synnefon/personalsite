import { useEffect, useRef, RefObject } from "react";
import type { Vec2 } from "../config.ts";

export function usePointerHandling(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const pointerDownRef = useRef(false);
  const pointerCoolingRef = useRef(false);
  const pointerPosRef = useRef<Vec2>({ x: 0, y: 0 });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const toLocal = (e: PointerEvent) => {
      const rect = c.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      pointerDownRef.current = true;
      pointerCoolingRef.current =
        e.button === 2 || (e.button === 0 && e.ctrlKey);
      pointerPosRef.current = toLocal(e);
    };

    const onMove = (e: PointerEvent) => (pointerPosRef.current = toLocal(e));

    const onUp = () => {
      pointerDownRef.current = false;
      pointerCoolingRef.current = false;
    };

    c.addEventListener("pointerdown", onDown);
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      c.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [canvasRef]);

  return {
    pointerDownRef,
    pointerCoolingRef,
    pointerPosRef,
  };
}
