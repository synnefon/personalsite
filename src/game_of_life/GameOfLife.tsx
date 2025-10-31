import {
  type CSSProperties,
  ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import React from "react";
import "../styles/gameoflife.css";

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
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const DRAG_THRESHOLD_PX = 5;

// Game of Life rules
const LIFE_NEIGHBORS_SURVIVE = [2, 3];
const LIFE_NEIGHBORS_BIRTH = 3;

// Color and opacity constants
const UNDERCROWD_OPACITY = 0.6;
const OVERCROWD_OPACITY = 0.6;
const HEALTHY_OPACITY = 1.0;

// Gold: #d9a60e
const COLOR_GOLD = { r: 217, g: 166, b: 14 };
// Green for undercrowded: #64c850
const COLOR_GREEN = { r: 100, g: 200, b: 80 };
// Purple for overcrowded: #8b4789
const COLOR_PURPLE = { r: 139, g: 71, b: 137 };

// Starting pattern reference
const START_CENTER_X = 25;
const START_CENTER_Y = 26;
// Maximum neighbors for color blend
const OVERCROWD_BLEND_START = 4;
const OVERCROWD_BLEND_SPAN = 5;

const WHEEL_ZOOM_DELTA = 0.1;
const PINCH_ZOOM_DAMPING = 0.5;
const ZOOM_DEFAULT_LEVEL = 1;
const EXTRA_ROWS = 1; // for rendering extra padding

// helpers for Set keys
const makeKey = (x: number, y: number): string => `${x},${y}`;
const parseKey = (k: string): [number, number] =>
  k.split(",").map(Number) as [number, number];

export default function GameOfLifeInfinite(): ReactElement {
  /* --------------------------------------------------------------------- */
  /*  State                                                                */
  /* --------------------------------------------------------------------- */
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT_LEVEL);
  const zoomRef = useRef<number>(zoom);
  const ticksPerSec = useRef<number>(DEFAULT_TICK_PER_SEC);

  // Calculate grid dimensions based on window size and zoom
  const initialRows = Math.ceil(
    window.innerHeight / (CELL_SIZE / ZOOM_DEFAULT_LEVEL)
  );
  const initialCols = Math.ceil(
    window.innerWidth / (CELL_SIZE / ZOOM_DEFAULT_LEVEL)
  );

  const [dimensions, setDimensions] = useState<{ rows: number; cols: number }>({
    rows: initialRows,
    cols: initialCols,
  });
  const dimensionsRef = useRef(dimensions);

  const viewRows = dimensions.rows;
  const viewCols = dimensions.cols;

  // Center the starting shape in the viewport
  const [offset, setOffset] = useState<{ x: number; y: number }>({
    x: START_CENTER_X - initialCols / 2,
    y: START_CENTER_Y - initialRows / 2,
  });
  const offsetRef = useRef<{ x: number; y: number }>(offset);

  // Keep refs in sync
  useEffect(() => {
    zoomRef.current = zoom;
    offsetRef.current = offset;
    dimensionsRef.current = dimensions;
  }, [zoom, offset, dimensions]);

  // Handle window resize
  useEffect(() => {
    const handleResize = (): void => {
      const currentZoom = zoomRef.current;
      setDimensions({
        rows: Math.ceil(window.innerHeight / (CELL_SIZE / currentZoom)),
        cols: Math.ceil(window.innerWidth / (CELL_SIZE / currentZoom)),
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // forceRefresh = cheap way to make React repaint
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, forceRefresh] = useState<boolean>(false);

  /* ------------------------------------------------------------------ */
  /*  Optional static seed                                              */
  /* ------------------------------------------------------------------ */
  const STARTING_CONFIG: [number, number][] = [
    [25, 25],
    [25, 26],
    [24, 26],
    [25, 27],
    [26, 27],
  ];

  /* turn those pairs into a Set of "x,y" keys */
  const initialLive = new Set<string>(
    STARTING_CONFIG.map(([x, y]) => makeKey(x, y))
  );

  /* ------------------------------------------------------------------ */
  /*  State                                                             */
  /* ------------------------------------------------------------------ */
  const liveCellsRef = useRef<Set<string>>(initialLive);
  const runningRef = useRef<boolean>(false);

  /* --------------------------------------------------------------------- */
  /*  Core Life Logic                                                      */
  /* --------------------------------------------------------------------- */
  const runTick = useCallback(() => {
    if (!runningRef.current) return;

    const nextGen = new Set<string>();
    const neighbourCounter = new Map<string, number>();

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

    neighbourCounter.forEach((count, cellKey) => {
      const alive = liveCellsRef.current.has(cellKey);
      if (
        count === LIFE_NEIGHBORS_BIRTH ||
        (alive && LIFE_NEIGHBORS_SURVIVE.includes(count))
      )
        nextGen.add(cellKey);
    });

    liveCellsRef.current = nextGen;
    forceRefresh((v) => !v);
    setTimeout(runTick, 1_000 / ticksPerSec.current);
  }, [forceRefresh]);

  /* --------------------------------------------------------------------- */
  /*  Interaction Helpers                                                  */
  /* --------------------------------------------------------------------- */
  const toggleCell = (x: number, y: number): void => {
    if (isDraggingRef.current) return;

    const k = makeKey(x, y);
    const set = liveCellsRef.current;
    set.has(k) ? set.delete(k) : set.add(k);
    forceRefresh((v) => !v);
  };

  const onToggleStart = (): void => {
    runningRef.current = !runningRef.current;
    runningRef.current ? runTick() : forceRefresh((v) => !v);
  };

  // arrow-key panning and Enter/Space for play/pause
  useEffect(() => {
    const KEY_MOVE_AMOUNT = 1;
    const handler = (e: KeyboardEvent): void => {
      switch (e.key) {
        case "ArrowDown":
          setOffset((o) => ({ ...o, y: o.y - KEY_MOVE_AMOUNT }));
          break;
        case "ArrowUp":
          setOffset((o) => ({ ...o, y: o.y + KEY_MOVE_AMOUNT }));
          break;
        case "ArrowRight":
          setOffset((o) => ({ ...o, x: o.x - KEY_MOVE_AMOUNT }));
          break;
        case "ArrowLeft":
          setOffset((o) => ({ ...o, x: o.x + KEY_MOVE_AMOUNT }));
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onToggleStart();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggleStart]);

  // wheel zoom
  useEffect(() => {
    const handler = (e: WheelEvent): void => {
      e.preventDefault();
      const board = e.currentTarget as HTMLElement;
      const rect = board.getBoundingClientRect();

      // Mouse position relative to board (0 to 1)
      const mouseXRatio = (e.clientX - rect.left) / rect.width;
      const mouseYRatio = (e.clientY - rect.top) / rect.height;

      const currentZoom = zoomRef.current;
      const currentOffset = offsetRef.current;
      const currentDimensions = dimensionsRef.current;

      // Adjust zoom (scroll down = zoom in, scroll up = zoom out)
      const zoomDelta = e.deltaY > 0 ? WHEEL_ZOOM_DELTA : -WHEEL_ZOOM_DELTA;
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, currentZoom + zoomDelta)
      );

      // Calculate new dimensions based on new zoom
      const newRows = Math.ceil(window.innerHeight / (CELL_SIZE / newZoom));
      const newCols = Math.ceil(window.innerWidth / (CELL_SIZE / newZoom));

      // Adjust offset to keep the same visual point fixed
      const newOffset = {
        x: currentOffset.x - mouseXRatio * (newCols - currentDimensions.cols),
        y: currentOffset.y - mouseYRatio * (newRows - currentDimensions.rows),
      };

      setOffset(newOffset);
      setZoom(newZoom);
      setDimensions({ rows: newRows, cols: newCols });
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
        const currentDimensions = dimensionsRef.current;
        const board = document.querySelector(".gol-board") as HTMLElement;
        const rect = board?.getBoundingClientRect();
        if (!rect) return;

        const cellDx = (dx / rect.width) * currentDimensions.cols;
        const cellDy = (dy / rect.height) * currentDimensions.rows;

        setOffset((prev) => ({
          x: prev.x - cellDx,
          y: prev.y - cellDy,
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

        const currentZoom = zoomRef.current;
        const currentOffset = offsetRef.current;
        const currentDimensions = dimensionsRef.current;

        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        // Pinch-zoom with 50% damping
        const rawScale = currentDistance / initialDistance;
        const scale = 1 + (rawScale - 1) * PINCH_ZOOM_DAMPING;
        const newZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, currentZoom * scale)
        );

        const newRows = Math.ceil(window.innerHeight / (CELL_SIZE / newZoom));
        const newCols = Math.ceil(window.innerWidth / (CELL_SIZE / newZoom));

        const newOffset = {
          x:
            currentOffset.x - centerXRatio * (newCols - currentDimensions.cols),
          y:
            currentOffset.y - centerYRatio * (newRows - currentDimensions.rows),
        };

        setOffset(newOffset);
        setZoom(newZoom);
        setDimensions({ rows: newRows, cols: newCols });
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
          const currentDimensions = dimensionsRef.current;
          const board = document.querySelector(".gol-board") as HTMLElement;
          const rect = board?.getBoundingClientRect();
          if (!rect) return;

          const cellDx = (dx / rect.width) * currentDimensions.cols;
          const cellDy = (dy / rect.height) * currentDimensions.rows;

          setOffset((prev) => ({
            x: prev.x - cellDx,
            y: prev.y - cellDy,
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
  // Helper to count neighbors for a cell
  const countNeighbors = (x: number, y: number): number => {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (liveCellsRef.current.has(makeKey(x + dx, y + dy))) {
          count++;
        }
      }
    }
    return count;
  };

  // Get color for cell based on neighbors (green for undercrowded, purple for overcrowded)
  const getCellStyle = (neighbors: number): CSSProperties => {
    if (LIFE_NEIGHBORS_SURVIVE.includes(neighbors)) {
      return { opacity: HEALTHY_OPACITY };
    }

    // Undercrowded (0-1) -> interpolate gold-to-green
    if (neighbors < LIFE_NEIGHBORS_SURVIVE[0]) {
      const greenFactor =
        (LIFE_NEIGHBORS_SURVIVE[0] - neighbors) / LIFE_NEIGHBORS_SURVIVE[0];
      const r = Math.round(
        COLOR_GOLD.r * (1 - greenFactor) + COLOR_GREEN.r * greenFactor
      );
      const g = Math.round(
        COLOR_GOLD.g * (1 - greenFactor) + COLOR_GREEN.g * greenFactor
      );
      const b = Math.round(
        COLOR_GOLD.b * (1 - greenFactor) + COLOR_GREEN.b * greenFactor
      );
      return {
        backgroundColor: `rgb(${r}, ${g}, ${b})`,
        opacity: UNDERCROWD_OPACITY,
      };
    }

    // Overcrowded (4+) -> interpolate gold-to-purple
    if (neighbors >= OVERCROWD_BLEND_START) {
      const purpleFactor = Math.min(
        (neighbors - (OVERCROWD_BLEND_START - 1)) / OVERCROWD_BLEND_SPAN,
        1
      );
      const r = Math.round(
        COLOR_GOLD.r * (1 - purpleFactor) + COLOR_PURPLE.r * purpleFactor
      );
      const g = Math.round(
        COLOR_GOLD.g * (1 - purpleFactor) + COLOR_PURPLE.g * purpleFactor
      );
      const b = Math.round(
        COLOR_GOLD.b * (1 - purpleFactor) + COLOR_PURPLE.b * purpleFactor
      );
      return {
        backgroundColor: `rgb(${r}, ${g}, ${b})`,
        opacity: OVERCROWD_OPACITY,
      };
    }

    return { opacity: HEALTHY_OPACITY };
  };

  const offsetX = Math.floor(offset.x);
  const offsetY = Math.floor(offset.y);

  const fractionalX = offset.x - offsetX;
  const fractionalY = offset.y - offsetY;

  // Render one extra row and column to fill gaps when transformed
  const rows: ReactElement[] = [];
  for (let r = 0; r < viewRows + EXTRA_ROWS; r++) {
    const cells: ReactElement[] = [];
    for (let c = 0; c < viewCols + EXTRA_ROWS; c++) {
      const cellX = c + offsetX;
      const cellY = r + offsetY;
      const filled = liveCellsRef.current.has(makeKey(cellX, cellY));
      const neighborCount = filled ? countNeighbors(cellX, cellY) : 0;

      cells.push(
        <div
          key={`cell-${cellX},${cellY}`}
          className={`gol-board-cell${filled ? " filled" : ""}`}
          style={
            filled
              ? {
                  backgroundColor: `rgb(${COLOR_GOLD.r}, ${COLOR_GOLD.g}, ${COLOR_GOLD.b})`,
                }
              : undefined
          }
          onClick={() => toggleCell(cellX, cellY)}
        />
      );
    }
    rows.push(
      <div key={`row-${r + offsetY}`} className="gol-board-row">
        {cells}
      </div>
    );
  }

  /* --------------------------------------------------------------------- */
  /*  Helpers                                                              */
  /* --------------------------------------------------------------------- */
  const displayVal = (v: number): string | number => (v === 0 ? "" : v);

  return (
    <div id="game-of-life" className="gol-container">
      {/* BOARD */}
      <div
        className={`gol-board${
          isPointerDown && !isDragging ? " mouse-down" : ""
        }${isDragging ? " dragging" : ""}`}
        style={
          {
            "--rows": viewRows,
            "--cols": viewCols,
          } as CSSProperties
        }
      >
        <div
          className="gol-board-content"
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
        {/* start / pause */}
        <div
          className={`gol-start-button${runningRef.current ? " running" : ""}`}
          onClick={onToggleStart}
        >
          {runningRef.current ? "pause" : "start"}
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
                forceRefresh((v) => !v);
              }}
            />
          </label>
        </div>
      </aside>
    </div>
  );
}
