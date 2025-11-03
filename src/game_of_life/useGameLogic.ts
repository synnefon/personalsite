import { useCallback, useEffect, useRef } from "react";
import {
  MAX_LIVE_CELLS,
  CULLING_MARGIN,
  LIFE_NEIGHBORS_BIRTH,
} from "./constants.ts";
import { makeKey, parseKey } from "./utils.ts";
import { type Viewport } from "./types.ts";

interface UseGameLogicProps {
  liveCellsRef: React.MutableRefObject<Set<number>>;
  viewportRef: React.MutableRefObject<Viewport>;
  ticksPerSec: React.MutableRefObject<number>;
  setGeneration: React.Dispatch<React.SetStateAction<number>>;
  setTickCount: React.Dispatch<React.SetStateAction<number>>;
  setRunning: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useGameLogic({
  liveCellsRef,
  viewportRef,
  ticksPerSec,
  setGeneration,
  setTickCount,
  setRunning,
}: UseGameLogicProps) {
  const runningRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const growthCountRef = useRef<number>(0);

  const runTick = useCallback(
    (timestamp: number = performance.now()) => {
      if (!runningRef.current) {
        animationFrameRef.current = null;
        return;
      }

      const elapsed = timestamp - lastTickTimeRef.current;
      const interval = 1_000 / ticksPerSec.current;

      if (elapsed >= interval) {
        const currentSize = liveCellsRef.current.size;

        // Check cell limit before processing
        if (currentSize >= MAX_LIVE_CELLS) {
          runningRef.current = false;
          animationFrameRef.current = null;
          alert(
            `Simulation paused: cell limit reached (${MAX_LIVE_CELLS} cells).`
          );
          setGeneration((g) => g + 1);
          return;
        }

        const nextGen = new Set<number>();
        const neighbourCounter = new Map<number, number>();

        // Calculate viewport bounds for culling
        const currentViewport = viewportRef.current;
        const minX = Math.floor(currentViewport.offset.x) - CULLING_MARGIN;
        const maxX =
          Math.floor(currentViewport.offset.x) +
          currentViewport.dimensions.cols +
          CULLING_MARGIN;
        const minY = Math.floor(currentViewport.offset.y) - CULLING_MARGIN;
        const maxY =
          Math.floor(currentViewport.offset.y) +
          currentViewport.dimensions.rows +
          CULLING_MARGIN;

        // Count neighbors from ALL live cells (including those outside bounds)
        // This ensures cells near the boundary have accurate neighbor counts
        liveCellsRef.current.forEach((cellKey) => {
          const [x, y] = parseKey(cellKey);

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const neighKey = makeKey(x + dx, y + dy);
              neighbourCounter.set(
                neighKey,
                (neighbourCounter.get(neighKey) || 0) + 1
              );
            }
          }
        });

        // Apply Game of Life rules, but only keep cells within culling bounds
        neighbourCounter.forEach((count, cellKey) => {
          const alive = liveCellsRef.current.has(cellKey);
          if (
            count === LIFE_NEIGHBORS_BIRTH ||
            (alive && (count === 2 || count === 3))
          ) {
            // Only add to next generation if within culling bounds
            const [x, y] = parseKey(cellKey);
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
              nextGen.add(cellKey);
            }
          }
        });

        // Check if all cells died
        if (nextGen.size === 0) {
          runningRef.current = false;
          setRunning(false);
          animationFrameRef.current = null;
          liveCellsRef.current = nextGen;
          setGeneration((g) => g + 1);
          return;
        }

        // Growth detection
        if (nextGen.size > currentSize * 1.5) {
          growthCountRef.current++;
          if (growthCountRef.current >= 10) {
            console.warn(
              `Exponential growth detected: ${currentSize} → ${nextGen.size} cells over 10 generations`
            );
            growthCountRef.current = 0;
          }
        } else {
          growthCountRef.current = 0;
        }

        liveCellsRef.current = nextGen;
        setGeneration((g) => g + 1);
        setTickCount((t) => t + 1);
        lastTickTimeRef.current = timestamp;
      }

      animationFrameRef.current = requestAnimationFrame(runTick);
    },
    [liveCellsRef, viewportRef, ticksPerSec, setGeneration, setTickCount, setRunning]
  );

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    runningRef,
    animationFrameRef,
    lastTickTimeRef,
    runTick,
  };
}
