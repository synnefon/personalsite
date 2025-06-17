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
  const [size, setSize] = useState<number>(DEFAULT_SIZE); // rows = cols
  const ticksPerSec = useRef<number>(DEFAULT_TICK_PER_SEC); // rows = cols
  const viewRows = size;
  const viewCols = size;

  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  /* --------------------------------------------------------------------- */
  /*  Render Board                                                         */
  /* --------------------------------------------------------------------- */
  const rows: ReactElement[] = [];
  for (let r = 0; r < viewRows; r++) {
    const cells: ReactElement[] = [];
    for (let c = 0; c < viewCols; c++) {
      const x = c + offset.x;
      const y = r + offset.y;
      const filled = liveCellsRef.current.has(makeKey(x, y));
      cells.push(
        <div
          key={`cell-${x},${y}`}
          className={`gol-board-cell${filled ? " filled" : ""}`}
          onClick={() => toggleCell(x, y)}
        />
      );
    }
    rows.push(
      <div key={`row-${r + offset.y}`} className="gol-board-row">
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
        className="gol-board"
        style={{ "--rows": viewRows, "--cols": viewCols } as React.CSSProperties}
      >
        {rows}
      </div>

      {/* CONTROLS */}
      <aside className="gol-controls">
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
