import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import "../styles/calendarpuzzle.css";
import { roundedOutline } from "./outline.ts";
import { Solution, solve } from "./solver.ts";
import {
  COLS,
  DotMode,
  LABELS,
  MONTH_LABELS,
  PIECES,
  ROWS,
  WEEKDAY_LABELS,
  cellOf,
} from "./puzzle.ts";

const CELL = 64; // viewBox units per board cell
const FRAME = 30; // frame border around the grid
const BOARD_W = COLS * CELL + FRAME * 2;
const BOARD_H = ROWS * CELL + FRAME * 2;
const KERF = 3.4; // visible gap between pieces (stroke in board color)
const FILLET = 9; // rounded corner radius on pieces
const DOT_R = 7.5;

const MODES: { value: DotMode; label: string }[] = [
  { value: "ignore", label: "ignore dots" },
  { value: "all", label: "all 10 dots" },
  { value: "none", label: "no dots" },
];

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

function todayISO(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

// parse "yyyy-mm-dd" by hand: new Date(iso) would read it as UTC and
// shift the day near midnight
function parseISO(iso: string): Ymd {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

// real calendar dates only: Date would roll 2026-02-31 over to march
function isValidISO(iso: string | null): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { y, m, d } = parseISO(iso);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isDotMode(value: string | null): value is DotMode {
  return value === "ignore" || value === "all" || value === "none";
}

function windowCells({ y, m, d }: Ymd): { cells: number[]; caption: string } {
  const weekday = WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
  const month = MONTH_LABELS[m - 1];
  return {
    cells: [cellOf(month), cellOf(weekday), cellOf(String(d))],
    caption: `${weekday} ${month} ${d}`.toLowerCase(),
  };
}

function BaseBoard({ blocked }: { blocked: number[] }) {
  const blockedSet = new Set(blocked);
  return (
    <g>
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={16} className="cp-frame" />
      <rect
        x={FRAME}
        y={FRAME}
        width={COLS * CELL}
        height={ROWS * CELL}
        rx={6}
        className="cp-face"
      />
      {/* scored grid lines, like the physical date board */}
      {Array.from({ length: COLS - 1 }, (_, i) => (
        <line
          key={`v${i}`}
          x1={FRAME + (i + 1) * CELL}
          y1={FRAME}
          x2={FRAME + (i + 1) * CELL}
          y2={FRAME + ROWS * CELL}
          className="cp-score"
        />
      ))}
      {Array.from({ length: ROWS - 1 }, (_, i) => (
        <line
          key={`h${i}`}
          x1={FRAME}
          y1={FRAME + (i + 1) * CELL}
          x2={FRAME + COLS * CELL}
          y2={FRAME + (i + 1) * CELL}
          className="cp-score"
        />
      ))}
      {LABELS.flatMap((row, r) =>
        row.map((label, c) => {
          const idx = r * COLS + c;
          const isWindow = blockedSet.has(idx);
          const isMonthOrDay = Number.isNaN(Number(label));
          return (
            <g key={label}>
              {isWindow && (
                <rect
                  x={FRAME + c * CELL + 3}
                  y={FRAME + r * CELL + 3}
                  width={CELL - 6}
                  height={CELL - 6}
                  rx={7}
                  className="cp-window"
                />
              )}
              <text
                x={FRAME + (c + 0.5) * CELL}
                y={FRAME + (r + 0.5) * CELL}
                className={`cp-label ${isMonthOrDay ? "cp-label-word" : "cp-label-num"} ${
                  isWindow ? "cp-label-window" : ""
                }`}
              >
                {label}
              </text>
            </g>
          );
        })
      )}
    </g>
  );
}

function Pieces({ solution }: { solution: Solution }) {
  return (
    <g transform={`translate(${FRAME} ${FRAME})`}>
      {solution.placements.map((placement, i) => {
        const piece = PIECES[placement.pieceIdx];
        return (
          <g
            key={piece.name}
            className="cp-piece"
            style={{ animationDelay: `${i * 55}ms` }}
          >
            <path
              d={roundedOutline(placement.cells, CELL, FILLET)}
              fill={piece.color}
              strokeWidth={KERF}
              className="cp-piece-path"
            />
            {placement.dot && (
              <circle
                cx={placement.dot.x * CELL}
                cy={placement.dot.y * CELL}
                r={DOT_R}
                className="cp-dot"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

export default function CalendarPuzzle() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [iso, setIso] = useState(() => {
    const param = searchParams.get("date");
    return isValidISO(param) ? param : todayISO();
  });
  const [mode, setMode] = useState<DotMode>(() => {
    const param = searchParams.get("mode");
    return isDotMode(param) ? param : "ignore";
  });
  const [seed, setSeed] = useState(() => {
    const param = Number(searchParams.get("seed"));
    return Number.isInteger(param) && param > 0 ? param : 1;
  });
  const [showExplainer, setShowExplainer] = useState(false);

  // keep the url shareable: it always names the exact arrangement shown
  useEffect(() => {
    const stale =
      searchParams.get("date") !== iso ||
      searchParams.get("mode") !== mode ||
      searchParams.get("seed") !== String(seed);
    if (stale) setSearchParams({ date: iso, mode, seed: String(seed) }, { replace: true });
  }, [iso, mode, seed, searchParams, setSearchParams]);

  const ymd = useMemo(() => parseISO(iso), [iso]);
  const { cells: blocked, caption } = useMemo(() => windowCells(ymd), [ymd]);
  const solution = useMemo(() => solve(blocked, mode, seed), [blocked, mode, seed]);

  return (
    <div className="calendar-puzzle">
      <div className="cp-header">
        <h1 className="cp-title">calendar puzzle</h1>
        <button className="cp-help-button" onClick={() => setShowExplainer(true)}>
          ?
        </button>
      </div>

      {showExplainer && (
        <div className="cp-modal-overlay" onClick={() => setShowExplainer(false)}>
          <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
            <button className="cp-modal-close" onClick={() => setShowExplainer(false)}>
              ×
            </button>
            <div className="cp-explainer">
              <h2>what is this</h2>
              <p>
                a digital twin of the wooden calendar puzzle designed by{" "}
                <a
                  href="https://polypuzzlelab.blogspot.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  polypuzzlelab
                </a>
                . ten polyomino pieces tile a 10×5 board of calendar cells, leaving
                exactly three windows open: the month, the day of the week, and the date.
                there's a valid arrangement for every single day, and this page finds
                one.
              </p>
              <h2>the dots</h2>
              <p>
                each wooden piece has one dot engraved on one face, and flipping a piece
                over mirrors its shape. that gives three challenges: <b>ignore dots</b>{" "}
                (any side up — easiest), <b>all 10 dots</b> (every piece dot-side up), and{" "}
                <b>no dots</b> (every piece flipped). the solver honors whichever rule you
                pick, and draws the dots it would show.
              </p>
              <p>
                <b>shuffle</b> re-solves with a different random walk, so you can browse
                the many arrangements each day hides.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="cp-controls">
        <input
          className="cp-date-input"
          type="date"
          value={iso}
          onChange={(e) => e.target.value && setIso(e.target.value)}
        />
        <div className="cp-mode-toggle">
          {MODES.map(({ value, label }) => (
            <button
              key={value}
              className={`cp-mode-button ${mode === value ? "selected" : ""}`}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="cp-shuffle-button" onClick={() => setSeed((s) => s + 1)}>
          shuffle
        </button>
      </div>

      <div className="cp-board-wrap">
        <svg
          className="cp-board"
          viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
          role="img"
          aria-label={`calendar puzzle solved for ${caption}`}
        >
          <BaseBoard blocked={blocked} />
          {solution && <Pieces key={`${iso}|${mode}|${seed}`} solution={solution} />}
        </svg>
        {!solution && (
          <div className="cp-no-solution">
            no arrangement exists for this combination — try another dot rule
          </div>
        )}
      </div>

      <div className="cp-caption">
        {caption}
        {solution &&
          ` · solved in ${solution.ms < 1 ? "<1" : Math.round(solution.ms)}ms · ${
            solution.nodes
          } states explored`}
      </div>

      <div className="cp-credit">
        puzzle design by{" "}
        <a href="https://polypuzzlelab.blogspot.com/" target="_blank" rel="noreferrer">
          polypuzzlelab
        </a>
      </div>
    </div>
  );
}
