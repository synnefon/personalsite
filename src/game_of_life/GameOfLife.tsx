import {
  type CSSProperties,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";

import React from "react";
import "../styles/gameoflife.css";
import { getRandomPattern, PATTERNS, type PatternConfig } from "./patterns.ts";

/*
  Infinite Game of Life with a square viewport size selector.
  – A single "size" input controls both rows and columns (rows = cols).
  – Live cells stored sparsely in a Set keyed by "x,y".
  – Arrow keys pan; click toggles cells; start/pause runs generations every 250 ms.
  – Sidebar elements are neatly stacked, with the rules in an ordered list so
    they never overlap the start/pause button.
*/

// General-purpose constants (no magic numbers)
const DEFAULT_TICK_PER_SEC = 3;
const MAX_TICK_PER_SEC = 10;
const CELL_SIZE = 20; // px - fixed cell size
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD_PX = 5;

// Memory management constants
const MAX_LIVE_CELLS = 50000; // Maximum cells before pausing simulation
const CULLING_MARGIN = 100; // Cells beyond viewport to keep

// Key encoding constants - using offset encoding to handle negative coordinates
// JavaScript numbers have 53 bits of integer precision, so we can safely use:
// - 26 bits for x (range: -33M to +33M)
// - 26 bits for y (range: -33M to +33M)
const COORD_OFFSET = 33554432; // 2^25 - offset to ensure coordinates are always positive
const KEY_MULTIPLIER = 67108864; // 2^26 - multiplier for x coordinate

// Game of Life rules
const LIFE_NEIGHBORS_BIRTH = 3;

// Gold: #d9a60e
const COLOR_GOLD = { r: 217, g: 166, b: 14 };

const WHEEL_ZOOM_DELTA = 0.1;
const PINCH_ZOOM_DAMPING = 0.5;
const ZOOM_DEFAULT_LEVEL = 1;
const EXTRA_ROWS = 1; // for rendering extra padding

// helpers for Set keys - using offset encoding to correctly handle negative coordinates
const makeKey = (x: number, y: number): number =>
  (x + COORD_OFFSET) * KEY_MULTIPLIER + (y + COORD_OFFSET);

const parseKey = (k: number): [number, number] => {
  const x = Math.floor(k / KEY_MULTIPLIER) - COORD_OFFSET;
  const y = (k % KEY_MULTIPLIER) - COORD_OFFSET;
  return [x, y];
};

// Memoized cell component - only re-renders when filled state changes
const Cell = memo(
  ({ x, y, filled }: { x: number; y: number; filled: boolean }) => (
    <div
      data-cell-x={x}
      data-cell-y={y}
      className={`gol-board-cell${filled ? " filled" : ""}`}
      style={
        filled
          ? {
              backgroundColor: `rgb(${COLOR_GOLD.r}, ${COLOR_GOLD.g}, ${COLOR_GOLD.b})`,
            }
          : undefined
      }
    />
  )
);
Cell.displayName = "Cell";

export default function GameOfLifeInfinite(): ReactElement {
  /* --------------------------------------------------------------------- */
  /*  State                                                                */
  /* --------------------------------------------------------------------- */
  const ticksPerSec = useRef<number>(DEFAULT_TICK_PER_SEC);

  // Calculate grid dimensions based on window size and zoom
  const initialRows = Math.ceil(
    window.innerHeight / (CELL_SIZE * ZOOM_DEFAULT_LEVEL)
  );
  const initialCols = Math.ceil(
    window.innerWidth / (CELL_SIZE * ZOOM_DEFAULT_LEVEL)
  );

  /* ------------------------------------------------------------------ */
  /*  Starting pattern                                                  */
  /* ------------------------------------------------------------------ */
  const [{ initialLive, patternCenterX, patternCenterY, selectedPattern }] = useState(() => {
    const pattern = getRandomPattern();
    const live = new Set<number>(
      pattern.pattern.map(([x, y]) => makeKey(x, y))
    );

    // Calculate pattern bounds to center it in viewport
    const patternBounds = {
      minX: Math.min(...pattern.pattern.map(([x]) => x)),
      maxX: Math.max(...pattern.pattern.map(([x]) => x)),
      minY: Math.min(...pattern.pattern.map(([, y]) => y)),
      maxY: Math.max(...pattern.pattern.map(([, y]) => y)),
    };
    const centerX = (patternBounds.minX + patternBounds.maxX) / 2;
    const centerY = (patternBounds.minY + patternBounds.maxY) / 2;

    return {
      selectedPattern: pattern,
      initialLive: live,
      patternCenterX: centerX,
      patternCenterY: centerY,
    };
  });

  // Batched viewport state to prevent race conditions during zoom/pan
  const [viewport, setViewport] = useState<{
    zoom: number;
    offset: { x: number; y: number };
    dimensions: { rows: number; cols: number };
  }>({
    zoom: ZOOM_DEFAULT_LEVEL,
    offset: {
      x: patternCenterX - initialCols / 2,
      y: patternCenterY - initialRows / 2,
    },
    dimensions: { rows: initialRows, cols: initialCols },
  });

  // Keep ref in sync for runTick to access without triggering re-renders
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const { zoom, offset, dimensions } = viewport;
  const viewRows = dimensions.rows;
  const viewCols = dimensions.cols;

  // Handle window resize
  useEffect(() => {
    const handleResize = (): void => {
      const currentViewport = viewportRef.current;
      setViewport({
        ...currentViewport,
        dimensions: {
          rows: Math.ceil(window.innerHeight / (CELL_SIZE * currentViewport.zoom)),
          cols: Math.ceil(window.innerWidth / (CELL_SIZE * currentViewport.zoom)),
        },
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Generation counter for triggering re-renders when cells change
  const [generation, setGeneration] = useState<number>(0);

  // Tick counter for display
  const [tickCount, setTickCount] = useState<number>(0);

  // Splash screen state
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [fadingSplash, setFadingSplash] = useState<boolean>(false);

  // Reset button animation state
  const [resetClicked, setResetClicked] = useState<boolean>(false);

  // Pattern selection state
  const [currentPattern, setCurrentPattern] = useState<PatternConfig | null>(selectedPattern);

  // Reset state - stores the cell state to reset to (make a copy of initialLive)
  const resetStateRef = useRef<Set<number>>(new Set(initialLive));
  const resetOffsetRef = useRef<{ x: number; y: number }>({
    x: patternCenterX - initialCols / 2,
    y: patternCenterY - initialRows / 2,
  });

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback((): void => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Handle splash screen timing
  useEffect(() => {
    // Start fade out after 5 seconds
    const fadeTimer = setTimeout(() => {
      setFadingSplash(true);
    }, 2000);

    // Remove splash completely after 6 seconds (5s display + 1s fade)
    const removeTimer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /*  State                                                             */
  /* ------------------------------------------------------------------ */
  const liveCellsRef = useRef<Set<number>>(initialLive);
  const [running, setRunning] = useState<boolean>(false);
  const runningRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const growthCountRef = useRef<number>(0); // Track consecutive growth for warnings

  /* --------------------------------------------------------------------- */
  /*  Core Life Logic                                                      */
  /* --------------------------------------------------------------------- */
  const runTick = useCallback((timestamp: number = performance.now()) => {
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
        Math.floor(currentViewport.offset.x) + currentViewport.dimensions.cols + CULLING_MARGIN;
      const minY = Math.floor(currentViewport.offset.y) - CULLING_MARGIN;
      const maxY =
        Math.floor(currentViewport.offset.y) + currentViewport.dimensions.rows + CULLING_MARGIN;

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
  }, []);

  /* --------------------------------------------------------------------- */
  /*  Interaction Helpers                                                  */
  /* --------------------------------------------------------------------- */
  const toggleCell = useCallback((x: number, y: number): void => {
    if (isDraggingRef.current) return;

    const k = makeKey(x, y);
    const set = liveCellsRef.current;
    set.has(k) ? set.delete(k) : set.add(k);

    setGeneration((g) => g + 1);
  }, []);

  const loadPattern = useCallback((pattern: PatternConfig | null): void => {
    // Pause the simulation
    runningRef.current = false;
    setRunning(false);
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Reset tick counter
    setTickCount(0);

    // Load the pattern (or empty if null)
    const newLive = pattern
      ? new Set<number>(pattern.pattern.map(([x, y]) => makeKey(x, y)))
      : new Set<number>();

    // Update cells
    liveCellsRef.current = newLive;

    // Calculate center and update viewport
    const currentViewport = viewportRef.current;
    let newOffset = currentViewport.offset;

    if (pattern) {
      const patternBounds = {
        minX: Math.min(...pattern.pattern.map(([x]) => x)),
        maxX: Math.max(...pattern.pattern.map(([x]) => x)),
        minY: Math.min(...pattern.pattern.map(([, y]) => y)),
        maxY: Math.max(...pattern.pattern.map(([, y]) => y)),
      };
      const centerX = (patternBounds.minX + patternBounds.maxX) / 2;
      const centerY = (patternBounds.minY + patternBounds.maxY) / 2;

      newOffset = {
        x: centerX - currentViewport.dimensions.cols / 2,
        y: centerY - currentViewport.dimensions.rows / 2,
      };

      setViewport({
        ...currentViewport,
        offset: newOffset,
      });
    }

    // Save as reset state
    resetStateRef.current = new Set(newLive);
    resetOffsetRef.current = newOffset;

    setGeneration((g) => g + 1);
  }, []);

  const resetBoard = useCallback((): void => {
    // Pause the simulation
    runningRef.current = false;
    setRunning(false);
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Reset tick counter
    setTickCount(0);

    // Load from saved reset state
    liveCellsRef.current = new Set(resetStateRef.current);

    // Restore saved viewport offset
    const currentViewport = viewportRef.current;
    setViewport({
      ...currentViewport,
      offset: resetOffsetRef.current,
    });

    setGeneration((g) => g + 1);

    // Trigger animation
    setResetClicked(true);
    setTimeout(() => {
      setResetClicked(false);
    }, 900);
  }, []);

  const onToggleStart = useCallback((): void => {
    const newRunning = !runningRef.current;
    runningRef.current = newRunning;
    setRunning(newRunning); // Update state immediately for UI

    if (newRunning) {
      // Save current state as reset state when starting
      resetStateRef.current = new Set(liveCellsRef.current);
      resetOffsetRef.current = viewportRef.current.offset;

      lastTickTimeRef.current = performance.now();
      runTick();
    } else {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setGeneration((g) => g + 1);
    }
  }, [runTick]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // arrow-key panning and Enter/Space for play/pause
  useEffect(() => {
    const KEY_MOVE_AMOUNT = 1;
    const handler = (e: KeyboardEvent): void => {
      switch (e.key) {
        case "ArrowDown":
          setViewport((v) => ({
            ...v,
            offset: { ...v.offset, y: v.offset.y - KEY_MOVE_AMOUNT },
          }));
          break;
        case "ArrowUp":
          setViewport((v) => ({
            ...v,
            offset: { ...v.offset, y: v.offset.y + KEY_MOVE_AMOUNT },
          }));
          break;
        case "ArrowRight":
          setViewport((v) => ({
            ...v,
            offset: { ...v.offset, x: v.offset.x - KEY_MOVE_AMOUNT },
          }));
          break;
        case "ArrowLeft":
          setViewport((v) => ({
            ...v,
            offset: { ...v.offset, x: v.offset.x + KEY_MOVE_AMOUNT },
          }));
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onToggleStart();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggleStart, toggleFullscreen]);

  // wheel zoom
  useEffect(() => {
    const handler = (e: WheelEvent): void => {
      e.preventDefault();
      const board = e.currentTarget as HTMLElement;
      const rect = board.getBoundingClientRect();

      // Mouse position relative to board (0 to 1)
      const mouseXRatio = (e.clientX - rect.left) / rect.width;
      const mouseYRatio = (e.clientY - rect.top) / rect.height;

      const currentViewport = viewportRef.current;

      // Adjust zoom (scroll down = zoom in, scroll up = zoom out)
      const zoomDelta = e.deltaY > 0 ? WHEEL_ZOOM_DELTA : -WHEEL_ZOOM_DELTA;
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, currentViewport.zoom + zoomDelta)
      );

      // Calculate new dimensions based on new zoom
      const newRows = Math.ceil(window.innerHeight / (CELL_SIZE * newZoom));
      const newCols = Math.ceil(window.innerWidth / (CELL_SIZE * newZoom));

      // Adjust offset to keep the same visual point fixed
      const newOffset = {
        x: currentViewport.offset.x - mouseXRatio * (newCols - currentViewport.dimensions.cols),
        y: currentViewport.offset.y - mouseYRatio * (newRows - currentViewport.dimensions.rows),
      };

      // Batched update to prevent race conditions
      setViewport({
        zoom: newZoom,
        offset: newOffset,
        dimensions: { rows: newRows, cols: newCols },
      });
    };
    const board = document.querySelector(".gol-board") as HTMLElement | null;
    if (board) {
      const eventHandler = handler as EventListener;
      board.addEventListener("wheel", eventHandler, { passive: false });
      return () => board.removeEventListener("wheel", eventHandler);
    }
    return;
  }, []);

  // Track if we're dragging to prevent click events
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);

  // drag/click detection (mouse)
  useEffect(() => {
    let isMouseDown = false;
    let hasDragged = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;

    const handleMouseDown = (e: MouseEvent): void => {
      if ((e.target as HTMLElement).closest(".gol-controls")) return;

      isMouseDown = true;
      hasDragged = false;
      setIsPointerDown(true);
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent): void => {
      if (!isMouseDown) return;

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;

      const totalDx = Math.abs(e.clientX - startX);
      const totalDy = Math.abs(e.clientY - startY);

      if (
        !hasDragged &&
        (totalDx > DRAG_THRESHOLD_PX || totalDy > DRAG_THRESHOLD_PX)
      ) {
        hasDragged = true;
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      if (hasDragged) {
        const currentViewport = viewportRef.current;
        const board = document.querySelector(".gol-board") as HTMLElement;
        const rect = board?.getBoundingClientRect();
        if (!rect) return;

        const cellDx = (dx / rect.width) * currentViewport.dimensions.cols;
        const cellDy = (dy / rect.height) * currentViewport.dimensions.rows;

        setViewport((prev) => ({
          ...prev,
          offset: {
            x: prev.offset.x - cellDx,
            y: prev.offset.y - cellDy,
          },
        }));
      }

      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handleMouseUp = (): void => {
      if (hasDragged) {
        setIsDragging(false);
      }
      isMouseDown = false;
      hasDragged = false;
      setIsPointerDown(false);
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 0);
    };

    const handleMouseLeave = (): void => {
      if (isMouseDown) {
        isMouseDown = false;
        hasDragged = false;
        setIsPointerDown(false);
        setIsDragging(false);
        isDraggingRef.current = false;
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  // drag/tap detection (touch) & pinch zoom
  useEffect(() => {
    let initialDistance = 0;
    let isTouching = false;
    let hasDragged = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;

    const handleTouchStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        isTouching = false;
        hasDragged = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDistance = Math.sqrt(dx * dx + dy * dy);
      } else if (e.touches.length === 1) {
        isTouching = true;
        hasDragged = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isTouching = false;
        hasDragged = false;
        const board = e.currentTarget as HTMLElement;
        const rect = board.getBoundingClientRect();

        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const centerXRatio = (centerX - rect.left) / rect.width;
        const centerYRatio = (centerY - rect.top) / rect.height;

        const currentViewport = viewportRef.current;

        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        // Pinch-zoom with 50% damping
        const rawScale = currentDistance / initialDistance;
        const scale = 1 + (rawScale - 1) * PINCH_ZOOM_DAMPING;
        const newZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, currentViewport.zoom * scale)
        );

        const newRows = Math.ceil(window.innerHeight / (CELL_SIZE * newZoom));
        const newCols = Math.ceil(window.innerWidth / (CELL_SIZE * newZoom));

        const newOffset = {
          x:
            currentViewport.offset.x - centerXRatio * (newCols - currentViewport.dimensions.cols),
          y:
            currentViewport.offset.y - centerYRatio * (newRows - currentViewport.dimensions.rows),
        };

        // Batched update to prevent race conditions
        setViewport({
          zoom: newZoom,
          offset: newOffset,
          dimensions: { rows: newRows, cols: newCols },
        });
      } else if (e.touches.length === 1 && isTouching) {
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;

        const totalDx = Math.abs(e.touches[0].clientX - startX);
        const totalDy = Math.abs(e.touches[0].clientY - startY);

        if (
          !hasDragged &&
          (totalDx > DRAG_THRESHOLD_PX || totalDy > DRAG_THRESHOLD_PX)
        ) {
          hasDragged = true;
          setIsDragging(true);
        }

        if (hasDragged) {
          e.preventDefault();
          const currentViewport = viewportRef.current;
          const board = document.querySelector(".gol-board") as HTMLElement;
          const rect = board?.getBoundingClientRect();
          if (!rect) return;

          const cellDx = (dx / rect.width) * currentViewport.dimensions.cols;
          const cellDy = (dy / rect.height) * currentViewport.dimensions.rows;

          setViewport((prev) => ({
            ...prev,
            offset: {
              x: prev.offset.x - cellDx,
              y: prev.offset.y - cellDy,
            },
          }));
        }

        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };

    const handleTouchEnd = (): void => {
      isTouching = false;
      setIsDragging(false);
    };

    const board = document.querySelector(".gol-board");
    if (board) {
      const startHandler = handleTouchStart as EventListener;
      const moveHandler = handleTouchMove as EventListener;
      const endHandler = handleTouchEnd as EventListener;

      board.addEventListener("touchstart", startHandler);
      board.addEventListener("touchmove", moveHandler, { passive: false });
      board.addEventListener("touchend", endHandler);

      return () => {
        board.removeEventListener("touchstart", startHandler);
        board.removeEventListener("touchmove", moveHandler);
        board.removeEventListener("touchend", endHandler);
      };
    }
  }, []);

  /* --------------------------------------------------------------------- */
  /*  Render Board                                                         */
  /* --------------------------------------------------------------------- */
  const offsetX = Math.floor(offset.x);
  const offsetY = Math.floor(offset.y);

  const fractionalX = offset.x - offsetX;
  const fractionalY = offset.y - offsetY;

  // Event delegation handler for cell clicks
  const handleBoardClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("gol-board-cell")) return;

      const x = target.getAttribute("data-cell-x");
      const y = target.getAttribute("data-cell-y");
      if (x && y) {
        toggleCell(Number(x), Number(y));
      }
    },
    [toggleCell]
  );

  // Memoized grid rendering - only recalculates when dependencies change
  // generation is needed to trigger re-render when cells change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const result: ReactElement[] = [];
    for (let r = 0; r < viewRows + EXTRA_ROWS; r++) {
      const cells: ReactElement[] = [];
      for (let c = 0; c < viewCols + EXTRA_ROWS; c++) {
        const cellX = c + offsetX;
        const cellY = r + offsetY;
        const filled = liveCellsRef.current.has(makeKey(cellX, cellY));

        cells.push(
          <Cell
            key={`cell-${cellX},${cellY}`}
            x={cellX}
            y={cellY}
            filled={filled}
          />
        );
      }
      result.push(
        <div key={`row-${r + offsetY}`} className="gol-board-row">
          {cells}
        </div>
      );
    }
    return result;
  }, [offsetX, offsetY, viewRows, viewCols, generation]);

  /* --------------------------------------------------------------------- */
  /*  Helpers                                                              */
  /* --------------------------------------------------------------------- */
  const displayVal = (v: number): string | number => (v === 0 ? "" : v);

  return (
    <div id="game-of-life" className="gol-container">
      {/* SPLASH SCREEN */}
      {showSplash && (
        <div className={`gol-splash${fadingSplash ? " fading" : ""}`}>
          <div className="gol-splash-text">
            Conway's
            <br />
            Game of Life
          </div>
        </div>
      )}

      {/* BOARD */}
      <div
        className={`gol-board${
          isPointerDown && !isDragging ? " mouse-down" : ""
        }${isDragging ? " dragging" : ""}${running ? " running" : ""}`}
        style={
          {
            "--rows": viewRows,
            "--cols": viewCols,
            "--zoom": zoom,
          } as CSSProperties
        }
      >
        <div
          className="gol-board-content"
          onClick={handleBoardClick}
          style={{
            transform: `translate(${-fractionalX * (100 / viewCols)}%, ${
              -fractionalY * (100 / viewRows)
            }%)`,
          }}
        >
          {rows}
        </div>
      </div>

      {/* CONTROLS */}
      <aside className="gol-controls">
        {/* pattern selector */}
        <div className="gol-control-group">
          <label>
            <div>pattern</div>
            <select
              className="gol-pattern-select"
              value={currentPattern?.name ?? "empty"}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "empty") {
                  setCurrentPattern(null);
                  loadPattern(null);
                } else {
                  const pattern = PATTERNS.find((p) => p.name === value);
                  if (pattern) {
                    setCurrentPattern(pattern);
                    loadPattern(pattern);
                  }
                }
              }}
            >
              <option value="empty">Empty</option>
              {PATTERNS.map((pattern) => (
                <option key={pattern.name} value={pattern.name}>
                  {pattern.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* start / pause */}
        <div
          className={`gol-start-button${running ? " running" : ""}`}
          onClick={onToggleStart}
        >
          {running ? "⏸" : "▶"}
        </div>

        {/* speed selector */}
        <div className="gol-control-group">
          <label>
            <div>ticks / second</div>
            <input
              type="number"
              min={0}
              max={MAX_TICK_PER_SEC}
              step={0.5}
              value={displayVal(ticksPerSec.current)}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  ticksPerSec.current = 0;
                } else {
                  const n = Math.max(
                    0,
                    Math.min(MAX_TICK_PER_SEC, Number(raw))
                  );
                  ticksPerSec.current = n;
                }
                setGeneration((g) => g + 1);
              }}
            />
          </label>
        </div>

        {/* reset button */}
        <div
          className={`gol-start-button${resetClicked ? " clearing" : ""}`}
          onClick={resetBoard}
        >
          ⟲
        </div>
      </aside>

      {/* TICK COUNTER */}
      <div className="gol-tick-counter">
        {tickCount}
      </div>

      {/* FULLSCREEN BUTTON */}
      <div
        className="gol-fullscreen-button"
        onClick={toggleFullscreen}
        title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: `${isFullscreen ? 1 : 0.3}`,
            fontSize: "2.4rem",
          }}
        >
          <div>{isFullscreen ? "⌟⌞" : "⌜⌝"}</div>
          <div>{isFullscreen ? "⌝⌜" : "⌞⌟"}</div>
        </div>
      </div>
    </div>
  );
}
