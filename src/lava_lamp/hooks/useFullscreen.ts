import { useCallback, useEffect, useState, RefObject } from "react";
import { clampAllToBounds } from "../utils/physics.ts";
import type { Particle } from "../utils/types.ts";

interface UseFullscreenParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  particlesRef: React.MutableRefObject<Particle[]>;
  sizeRef: React.MutableRefObject<{ w: number; h: number }>;
  imageRef: React.MutableRefObject<ImageData | null>;
}

export function useFullscreen({
  canvasRef,
  particlesRef,
  sizeRef,
  imageRef,
}: UseFullscreenParams) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
      document.body.classList.toggle(
        "lava-lamp-fullscreen",
        !!document.fullscreenElement
      );

      // Resize canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const w = window.innerWidth,
          h = window.innerHeight;
        canvas.width = w;
        canvas.height = h;
        sizeRef.current = { w, h };
        imageRef.current = null;
        particlesRef.current && clampAllToBounds(particlesRef.current, w, h);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.body.classList.remove("lava-lamp-fullscreen");
    };
  }, [canvasRef, particlesRef, sizeRef, imageRef]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  return {
    isFullscreen,
    toggleFullscreen,
  };
}
