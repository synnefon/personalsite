import {
  ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
const DEFAULT_SIZE = 50;
const MAX_SIZE = 150;

type Mode = "drag" | "place";

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
  const [mode, setMode] = useState<Mode>("place");
  const [size, setSize] = useState<number>(DEFAULT_SIZE); // rows = cols
  const sizeRef = useRef<number>(size);
  const ticksPerSec = useRef<number>(DEFAULT_TICK_PER_SEC); // rows = cols
  const viewRows = size;
  const viewCols = size;

  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const offsetRef = useRef<{ x: number; y: number }>(offset);

  // Keep refs in sync
  useEffect(() => {
    sizeRef.current = size;
    offsetRef.current = offset;
  }, [size, offset]);

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
    const k = makeKey(x, y);
    const set = liveCellsRef.current;
    set.has(k) ? set.delete(k) : set.add(k);
    forceRefresh((v) => !v);
  };

  const onToggleStart = (): void => {
    runningRef.current = !runningRef.current;
    runningRef.current ? runTick() : forceRefresh((v) => !v);
  };

  // arrow-key panning
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // wheel zoom
  useEffect(() => {
    const handler = (e: WheelEvent): void => {
      e.preventDefault();
      const board = e.currentTarget as HTMLElement;
      const rect = board.getBoundingClientRect();

      // Mouse position relative to board (0 to 1)
      const mouseXRatio = (e.clientX - rect.left) / rect.width;
      const mouseYRatio = (e.clientY - rect.top) / rect.height;

      const currentSize = sizeRef.current;
      const currentOffset = offsetRef.current;

      // Adjust size slower (1-2 cells per scroll)
      // scroll down (deltaY > 0) = zoom out = show more cells = increase size
      const delta = e.deltaY > 0 ? 2 : -2;
      const newSize = Math.max(10, Math.min(MAX_SIZE, currentSize + delta));

      // Adjust offset to keep the same visual point fixed
      // Formula: newOffset = oldOffset - mouseRatio * (newSize - oldSize)
      const newOffset = {
        x: currentOffset.x - mouseXRatio * (newSize - currentSize),
        y: currentOffset.y - mouseYRatio * (newSize - currentSize),
      };

      setOffset(newOffset);
      setSize(newSize);
    };
    const board = document.querySelector(".gol-board") as HTMLElement | null;
    if (board) {
      const eventHandler = handler as EventListener;
      board.addEventListener("wheel", eventHandler, { passive: false });
      return () => board.removeEventListener("wheel", eventHandler);
    }
    return;
  }, []);

  // drag functionality (mouse)
  useEffect(() => {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const handleMouseDown = (e: MouseEvent): void => {
      if (mode !== "drag") return;
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent): void => {
      if (!isDragging || mode !== "drag") return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const currentSize = sizeRef.current;
      const board = document.querySelector(".gol-board") as HTMLElement;
      const rect = board?.getBoundingClientRect();
      if (!rect) return;

      // Convert pixel movement to cell movement
      const cellDx = (dx / rect.width) * currentSize;
      const cellDy = (dy / rect.height) * currentSize;

      setOffset((prev) => ({
        x: prev.x - cellDx,
        y: prev.y - cellDy,
      }));
    };

    const handleMouseUp = (): void => {
      isDragging = false;
    };

    const board = document.querySelector(".gol-board");
    board?.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      board?.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [mode]);

  // drag functionality (touch) & pinch zoom
  useEffect(() => {
    let initialDistance = 0;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const handleTouchStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDistance = Math.sqrt(dx * dx + dy * dy);
      } else if (e.touches.length === 1 && mode === "drag") {
        isDragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isDragging = false;
        const board = e.currentTarget as HTMLElement;
        const rect = board.getBoundingClientRect();

        // Current center point between touches (recalculated each move)
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const centerXRatio = (centerX - rect.left) / rect.width;
        const centerYRatio = (centerY - rect.top) / rect.height;

        const currentSize = sizeRef.current;
        const currentOffset = offsetRef.current;

        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        // Slower zoom with damping factor
        const rawScale = currentDistance / initialDistance;
        const scale = 1 + (rawScale - 1) * 0.5; // 50% damping
        const targetSize = Math.round(currentSize / scale);
        const clampedSize = Math.max(10, Math.min(MAX_SIZE, targetSize));

        // Adjust offset to keep the current center point fixed
        // Formula: newOffset = oldOffset - centerRatio * (newSize - oldSize)
        const newOffset = {
          x: currentOffset.x - centerXRatio * (clampedSize - currentSize),
          y: currentOffset.y - centerYRatio * (clampedSize - currentSize),
        };

        setOffset(newOffset);
        setSize(clampedSize);
      } else if (e.touches.length === 1 && isDragging && mode === "drag") {
        e.preventDefault();
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;

        const currentSize = sizeRef.current;
        const board = document.querySelector(".gol-board") as HTMLElement;
        const rect = board?.getBoundingClientRect();
        if (!rect) return;

        // Convert pixel movement to cell movement
        const cellDx = (dx / rect.width) * currentSize;
        const cellDy = (dy / rect.height) * currentSize;

        setOffset((prev) => ({
          x: prev.x - cellDx,
          y: prev.y - cellDy,
        }));
      }
    };

    const handleTouchEnd = (): void => {
      isDragging = false;
    };

    const board = document.querySelector(".gol-board");
    board?.addEventListener("touchstart", handleTouchStart);
    board?.addEventListener("touchmove", handleTouchMove, { passive: false });
    board?.addEventListener("touchend", handleTouchEnd);
    return () => {
      board?.removeEventListener("touchstart", handleTouchStart);
      board?.removeEventListener("touchmove", handleTouchMove);
      board?.removeEventListener("touchend", handleTouchEnd);
    };
  }, [mode]);

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
          onClick={() => mode === "place" && toggleCell(cellX, cellY)}
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
        className={`gol-board${mode === "drag" ? " drag-mode" : ""}`}
        style={{
          "--rows": viewRows,
          "--cols": viewCols,
        } as React.CSSProperties}
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
        {/* mode toggle */}
        <div className="gol-mode-toggle">
          <div
            className={`gol-mode-button ${mode === "drag" ? "active" : ""}`}
            onClick={() => setMode("drag")}
          >
            drag
          </div>
          <div
            className={`gol-mode-button ${mode === "place" ? "active" : ""}`}
            onClick={() => setMode("place")}
          >
            place
          </div>
        </div>

        {/* start / pause */}
        <div className="gol-start-button" onClick={onToggleStart}>
          {runningRef.current ? "pause" : "start"}
        </div>

        {/* size selector */}
        <div className="gol-control-group">
          <label>
            <div>viewport dimension</div>
            <input
              type="number"
              min={0}
              max={MAX_SIZE}
              value={displayVal(size)}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setSize(0);
                } else {
                  const n = Math.max(0, Math.min(MAX_SIZE, Number(raw)));
                  setSize(n);
                }
              }}
            />
          </label>
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

        {/* rules list */}
        <ol className="gol-rules">
          <li>
            DIES: fewer than 2 neighbours, or more than 3
          </li>
          <li>
            STAYS ALIVE: 2 neighbors
          </li>
          <li>
            ALWAYS LIVES: exactly 3 neighbors
          </li>
        </ol>

        <div className="gol-hint">{"< use arrow keys pan >"}</div>
      </aside>
    </div>
  );
}
