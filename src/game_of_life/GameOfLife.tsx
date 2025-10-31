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

const DEFAULT_TICK_PER_SEC = 3;
const MAX_TICK_PER_SEC = 10;
const CELL_SIZE = 20; // Fixed cell size in pixels
const MIN_ZOOM = 0.5; // Minimum zoom level (larger cells)
const MAX_ZOOM = 3; // Maximum zoom level (smaller cells)
const DRAG_THRESHOLD = 5; // pixels to move before considering it a drag

// helpers for Set keys
const makeKey = (x: number, y: number): string => `${x},${y}`;
const parseKey = (k: string): [number, number] => k.split(",").map(Number) as [
  number,
  number
];

export default function GameOfLifeInfinite(): ReactElement {
  /* --------------------------------------------------------------------- */
  /*  State                                                                */
  /* --------------------------------------------------------------------- */
  const [zoom, setZoom] = useState<number>(1); // Zoom level multiplier
  const zoomRef = useRef<number>(zoom);
  const ticksPerSec = useRef<number>(DEFAULT_TICK_PER_SEC);

  // Calculate grid dimensions based on window size and zoom
  const [dimensions, setDimensions] = useState<{ rows: number; cols: number }>({
    rows: Math.ceil(window.innerHeight / (CELL_SIZE / zoom)),
    cols: Math.ceil(window.innerWidth / (CELL_SIZE / zoom)),
  });
  const dimensionsRef = useRef(dimensions);

  const viewRows = dimensions.rows;
  const viewCols = dimensions.cols;

  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
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

  /* turn those pairs into a Set of \"x,y\" keys */
  const initialLive = new Set<string>(
    STARTING_CONFIG.map(([x, y]) => `${x},${y}`)
  );

  /* ------------------------------------------------------------------ */
  /*  State                                                             */
  /* ------------------------------------------------------------------ */
  const liveCellsRef = useRef<Set<string>>(initialLive);   // ← seeded here
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
          neighbourCounter.set(neighKey, (neighbourCounter.get(neighKey) || 0) + 1);
        }
      }
    });

    neighbourCounter.forEach((count, cellKey) => {
      const alive = liveCellsRef.current.has(cellKey);
      if (count === 3 || (alive && count === 2)) nextGen.add(cellKey);
    });

    liveCellsRef.current = nextGen;
    forceRefresh((v) => !v);
    setTimeout(runTick, 1_000 / ticksPerSec.current);
  }, [forceRefresh]);

  /* --------------------------------------------------------------------- */
  /*  Interaction Helpers                                                  */
  /* --------------------------------------------------------------------- */
  const toggleCell = (x: number, y: number): void => {
    // Don't toggle if we just finished dragging
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
    const handler = (e: KeyboardEvent): void => {
      switch (e.key) {
        case "ArrowDown":
          setOffset((o) => ({ ...o, y: o.y - 1 }));
          break;
        case "ArrowUp":
          setOffset((o) => ({ ...o, y: o.y + 1 }));
          break;
        case "ArrowRight":
          setOffset((o) => ({ ...o, x: o.x - 1 }));
          break;
        case "ArrowLeft":
          setOffset((o) => ({ ...o, x: o.x + 1 }));
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

      // Adjust zoom (scroll down = zoom out = show more cells = decrease zoom)
      const zoomDelta = e.deltaY > 0 ? 0.05 : -0.05;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom + zoomDelta));

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
      // Ignore if clicking on a control element
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

      // Check if we've moved enough to be considered a drag
      const totalDx = Math.abs(e.clientX - startX);
      const totalDy = Math.abs(e.clientY - startY);

      if (!hasDragged && (totalDx > DRAG_THRESHOLD || totalDy > DRAG_THRESHOLD)) {
        hasDragged = true;
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      if (hasDragged) {
        const currentDimensions = dimensionsRef.current;
        const board = document.querySelector(".gol-board") as HTMLElement;
        const rect = board?.getBoundingClientRect();
        if (!rect) return;

        // Convert pixel movement to cell movement
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
        // Only update if we actually dragged
        setIsDragging(false);
      }
      isMouseDown = false;
      hasDragged = false;
      setIsPointerDown(false);
      // Reset drag flag after a brief delay to let click events check it
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 0);
    };

    const handleMouseLeave = (): void => {
      // Reset everything if mouse leaves window while dragging
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

        // Current center point between touches (recalculated each move)
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

        // Calculate new zoom level
        const rawScale = currentDistance / initialDistance;
        const scale = 1 + (rawScale - 1) * 0.5; // 50% damping
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * scale));

        // Calculate new dimensions based on new zoom
        const newRows = Math.ceil(window.innerHeight / (CELL_SIZE / newZoom));
        const newCols = Math.ceil(window.innerWidth / (CELL_SIZE / newZoom));

        // Adjust offset to keep the current center point fixed
        const newOffset = {
          x: currentOffset.x - centerXRatio * (newCols - currentDimensions.cols),
          y: currentOffset.y - centerYRatio * (newRows - currentDimensions.rows),
        };

        setOffset(newOffset);
        setZoom(newZoom);
        setDimensions({ rows: newRows, cols: newCols });
      } else if (e.touches.length === 1 && isTouching) {
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;

        // Check if we've moved enough to be considered a drag
        const totalDx = Math.abs(e.touches[0].clientX - startX);
        const totalDy = Math.abs(e.touches[0].clientY - startY);

        if (!hasDragged && (totalDx > DRAG_THRESHOLD || totalDy > DRAG_THRESHOLD)) {
          hasDragged = true;
          setIsDragging(true);
        }

        if (hasDragged) {
          e.preventDefault();
          const currentDimensions = dimensionsRef.current;
          const board = document.querySelector(".gol-board") as HTMLElement;
          const rect = board?.getBoundingClientRect();
          if (!rect) return;

          // Convert pixel movement to cell movement
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
  // Use integer offset for cell lookup
  const offsetX = Math.floor(offset.x);
  const offsetY = Math.floor(offset.y);

  // Calculate fractional part for smooth sub-pixel positioning
  const fractionalX = offset.x - offsetX;
  const fractionalY = offset.y - offsetY;

  // Render one extra row and column to fill gaps when transformed
  const rows: ReactElement[] = [];
  for (let r = 0; r < viewRows + 1; r++) {
    const cells: ReactElement[] = [];
    for (let c = 0; c < viewCols + 1; c++) {
      const cellX = c + offsetX;
      const cellY = r + offsetY;
      const filled = liveCellsRef.current.has(makeKey(cellX, cellY));
      cells.push(
        <div
          key={`cell-${cellX},${cellY}`}
          className={`gol-board-cell${filled ? " filled" : ""}`}
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
        className={`gol-board${isPointerDown && !isDragging ? " mouse-down" : ""}${isDragging ? " dragging" : ""}`}
        style={{
          "--rows": viewRows,
          "--cols": viewCols,
        } as CSSProperties}
      >
        <div
          className="gol-board-content"
          style={{
            transform: `translate(${-fractionalX * (100 / viewCols)}%, ${-fractionalY * (100 / viewRows)}%)`
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
                  const n = Math.max(0, Math.min(MAX_TICK_PER_SEC, Number(raw)));
                  ticksPerSec.current = n;
                }
                forceRefresh(v => !v);
              }}
            />
          </label>
        </div>
      </aside>
    </div>
  );
}
