import React, {
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Cell } from "./Cell.tsx";
import * as CONSTANTS from "./constants.ts";
import * as patterns from "./patterns.ts";
import type { Viewport } from "./types.ts";
import { useGameLogic } from "./useGameLogic.ts";
import { useInteractions } from "./useInteractions.ts";
import { makeKey } from "./utils.ts";
import Wip from "../projects/Wip";

import "../styles/gameoflife.css";

/*
  Infinite Game of Life with a square viewport size selector.
  – A single "size" input controls both rows and columns (rows = cols).
  – Live cells stored sparsely in a Set keyed by "x,y".
  – Arrow keys pan; click toggles cells; start/pause runs generations every 250 ms.
  – Sidebar elements are neatly stacked, with the rules in an ordered list so
    they never overlap the start/pause button.
*/

export default function GameOfLifeInfinite(): ReactElement {
  /* --------------------------------------------------------------------- */
  /*  State                                                                */
  /* --------------------------------------------------------------------- */
  const ticksPerSec = useRef<number>(CONSTANTS.DEFAULT_TICK_PER_SEC);

  // Calculate grid dimensions based on window size and zoom
  const initialRows = Math.ceil(
    window.innerHeight / (CONSTANTS.CELL_SIZE * CONSTANTS.ZOOM_DEFAULT_LEVEL)
  );
  const initialCols = Math.ceil(
    window.innerWidth / (CONSTANTS.CELL_SIZE * CONSTANTS.ZOOM_DEFAULT_LEVEL)
  );

  /* ------------------------------------------------------------------ */
  /*  Starting pattern                                                  */
  /* ------------------------------------------------------------------ */
  const [{ initialLive, patternCenterX, patternCenterY, selectedPattern }] =
    useState(() => {
      const pattern = patterns.getRandomPattern();
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
  const [viewport, setViewport] = useState<Viewport>({
    zoom: CONSTANTS.ZOOM_DEFAULT_LEVEL,
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
          rows: Math.ceil(
            window.innerHeight / (CONSTANTS.CELL_SIZE * currentViewport.zoom)
          ),
          cols: Math.ceil(
            window.innerWidth / (CONSTANTS.CELL_SIZE * currentViewport.zoom)
          ),
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
  const tickCountRef = useRef<number>(0);

  // Keep tickCountRef in sync with tickCount
  useEffect(() => {
    tickCountRef.current = tickCount;
  }, [tickCount]);

  // Splash screen state
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [fadingSplash, setFadingSplash] = useState<boolean>(false);

  // Reset button animation state
  const [resetClicked, setResetClicked] = useState<boolean>(false);

  // Pattern selection state
  const [currentPattern, setCurrentPattern] =
    useState<patterns.PatternConfig | null>(selectedPattern);

  // Reset state - stores the cell state to reset to (make a copy of initialLive)
  const resetStateRef = useRef<Set<number>>(new Set(initialLive));
  const resetOffsetRef = useRef<{ x: number; y: number }>({
    x: patternCenterX - initialCols / 2,
    y: patternCenterY - initialRows / 2,
  });
  const resetTickCountRef = useRef<number>(0);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Info popup state
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const wasRunningBeforeInfoRef = useRef<boolean>(false);

  // Mobile detection
  const [windowWidthState, setWindowWidthState] = useState<number>(window.innerWidth);
  const isMobile = windowWidthState <= 768;

  // Update mobile detection on resize
  useEffect(() => {
    const handleResizeForMobile = (): void => {
      setWindowWidthState(window.innerWidth);
    };
    window.addEventListener("resize", handleResizeForMobile);
    return () => window.removeEventListener("resize", handleResizeForMobile);
  }, []);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Handle escape key to close info popup (prevent exiting fullscreen)
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && showInfo) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setShowInfo(false);
      }
    };

    if (showInfo) {
      document.addEventListener("keydown", handleEscapeKey, { capture: true });
      return () => document.removeEventListener("keydown", handleEscapeKey, { capture: true });
    }
  }, [showInfo]);

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
    // Start fade out after 2 seconds
    const fadeTimer = setTimeout(() => {
      setFadingSplash(true);
    }, 2000);

    // Remove splash completely after 3 seconds (2s display + 1s fade)
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

  /* --------------------------------------------------------------------- */
  /*  Core Life Logic                                                      */
  /* --------------------------------------------------------------------- */
  const { runningRef, animationFrameRef, lastTickTimeRef, runTick } =
    useGameLogic({
      liveCellsRef,
      viewportRef,
      ticksPerSec,
      setGeneration,
      setTickCount,
      setRunning,
    });

  /* --------------------------------------------------------------------- */
  /*  Interaction Helpers                                                  */
  /* --------------------------------------------------------------------- */
  const toggleCell = useCallback((x: number, y: number): void => {
    if (isDraggingRef.current) return;

    const k = makeKey(x, y);
    const set = liveCellsRef.current;
    set.has(k) ? set.delete(k) : set.add(k);

    setGeneration((g) => g + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPattern = useCallback(
    (pattern: patterns.PatternConfig | null): void => {
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
      resetTickCountRef.current = 0;

      setGeneration((g) => g + 1);
    },
    [runningRef, animationFrameRef, viewportRef]
  );

  const resetBoard = useCallback((): void => {
    // Pause the simulation
    runningRef.current = false;
    setRunning(false);
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Reset tick counter to saved value
    setTickCount(resetTickCountRef.current);

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
  }, [runningRef, animationFrameRef, viewportRef]);

  const onToggleStart = useCallback((): void => {
    const newRunning = !runningRef.current;
    runningRef.current = newRunning;
    setRunning(newRunning); // Update state immediately for UI

    if (newRunning) {
      // Save current state as reset state when starting
      resetStateRef.current = new Set(liveCellsRef.current);
      resetOffsetRef.current = viewportRef.current.offset;
      resetTickCountRef.current = tickCountRef.current;

      lastTickTimeRef.current = performance.now();
      runTick();
    } else {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setGeneration((g) => g + 1);
    }
  }, [
    runTick,
    runningRef,
    animationFrameRef,
    lastTickTimeRef,
    viewportRef,
    tickCountRef,
  ]);

  /* --------------------------------------------------------------------- */
  /*  Interaction Handlers                                                 */
  /* --------------------------------------------------------------------- */
  const { isDraggingRef, isDragging, isPointerDown } = useInteractions({
    viewportRef,
    setViewport,
    onToggleStart,
    toggleFullscreen,
  });

  /* --------------------------------------------------------------------- */
  /*  Info Popup Pause/Resume Logic                                        */
  /* --------------------------------------------------------------------- */
  // Pause game when info popup opens, resume if it was running
  useEffect(() => {
    if (showInfo) {
      // Opening popup - save running state and pause
      wasRunningBeforeInfoRef.current = runningRef.current;
      if (runningRef.current) {
        runningRef.current = false;
        setRunning(false);
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      }
    } else if (wasRunningBeforeInfoRef.current) {
      // Closing popup - resume if it was running before
      runningRef.current = true;
      setRunning(true);
      lastTickTimeRef.current = performance.now();
      runTick();
    }
  }, [showInfo, runningRef, animationFrameRef, lastTickTimeRef, runTick]);

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
    for (let r = 0; r < viewRows + CONSTANTS.EXTRA_ROWS; r++) {
      const cells: ReactElement[] = [];
      for (let c = 0; c < viewCols + CONSTANTS.EXTRA_ROWS; c++) {
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
    // eslint-disable-next-line
  }, [offsetX, offsetY, viewRows, viewCols, generation]);

  /* --------------------------------------------------------------------- */
  /*  Helpers                                                              */
  /* --------------------------------------------------------------------- */
  const displayVal = (v: number): string | number => (v === 0 ? "" : v);

  // Show "desktop only" message on mobile
  if (isMobile) {
    return <Wip />;
  }

  return (
    <div id="game-of-life" className="gol-container">
      {/* SPLASH SCREEN */}
      {showSplash && (
        <div className={`gol-splash${fadingSplash ? " fading" : ""}`}>
          <div className="gol-splash-text">
            conway's
            <br />
            game of life
          </div>
        </div>
      )}

      {/* BOARD */}
      <div
        className={`gol-board${
          isPointerDown && !isDragging ? " mouse-down" : ""
        }${isDragging ? " dragging" : ""}${running ? " running" : ""}${
          zoom >= 2 ? " zoomed-in" : ""
        }`}
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
                  const pattern = patterns.PATTERNS.find(
                    (p) => p.name === value
                  );
                  if (pattern) {
                    setCurrentPattern(pattern);
                    loadPattern(pattern);
                  }
                }
              }}
            >
              <option value="empty">empty</option>
              {patterns.PATTERNS.map((pattern) => (
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
        <div
          className={`gol-start-button${resetClicked ? " clearing" : ""}`}
          onClick={resetBoard}
        >
          ⟲
        </div>

        {/* speed selector */}
        <div className="gol-control-group">
          <label>
            <div>ticks / second</div>
            <input
              type="number"
              min={1}
              max={CONSTANTS.MAX_TICK_PER_SEC}
              step={1}
              value={displayVal(ticksPerSec.current)}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  ticksPerSec.current = 0;
                } else {
                  const n = Math.max(
                    0,
                    Math.min(CONSTANTS.MAX_TICK_PER_SEC, Number(raw))
                  );
                  ticksPerSec.current = n;
                }
                setGeneration((g) => g + 1);
              }}
            />
          </label>
        </div>

        {/* reset button */}
      </aside>

      {/* INFO BUTTON */}
      <div
        className="gol-info-button"
        onClick={() => setShowInfo(true)}
        title="Rules"
      >
        ⚙
      </div>

      {/* INFO POPUP */}
      {showInfo && (
        <div className="gol-info-overlay" onClick={() => setShowInfo(false)}>
          <div className="gol-info-popup" onClick={(e) => e.stopPropagation()}>
            <button
              className="gol-info-close"
              onClick={() => setShowInfo(false)}
              title="Close (Esc)"
            >
              ✕
            </button>
            <h2>conway's game of life</h2>
            <div className="gol-info-content">
              <p>
                a cellular automaton in which cells live, die, or reproduce
                based on simple rules:
              </p>
              <ol>
                <li>
                  <strong>underpopulation:</strong> a live cell with fewer than
                  2 live neighbors dies
                </li>
                <li>
                  <strong>survival:</strong> a live cell with 2 or 3 live
                  neighbors survives
                </li>
                <li>
                  <strong>reproduction:</strong> a dead cell with exactly 3 live
                  neighbors becomes alive
                </li>
                <li>
                  <strong>overpopulation:</strong> a live cell with more than 3
                  live neighbors dies
                </li>
              </ol>
              <p className="gol-info-controls">
                <strong>controls:</strong>
                <br />
                click cells to toggle • arrow keys to pan • scroll to zoom •
                drag to pan • f for fullscreen
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TICK COUNTER */}
      <div className="gol-tick-counter">{tickCount}</div>

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
