import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ColorBlindToggle from "../components/ColorBlindToggle";
import { useColorBlindMode } from "../context/ColorBlindModeContext";
import { PersonalAudio } from "../util/Audio";
import Wip from "../projects/Wip";

import gameOverNoise from "../assets/snek/game_over.mp3";
import clickNoise from "../assets/snek/groovy_click.mp3";
import gameMusicNoise from "../assets/snek/the_gathering.mp3";

import "../styles/snek.css";

const COLs = 35;
const ROWs = 20;
const DEFAULT_SNEK_LENGTH = 6;
const TICK_SPEED_MS = 125;
const POINTS_PER_LEVEL = 5;
const CELL = 22; // px per cell

const UP = 0;
const RIGHT = 1;
const DOWN = 2;
const LEFT = 3;

const BOARD_W = COLs * CELL;
const BOARD_H = ROWs * CELL;

// Helper functions (pure, no dependencies)
const idxOf = (r, c) => r * COLs + c;
const outOfBounds = (r, c) => r < 0 || c < 0 || r >= ROWs || c >= COLs;
const opposite = (d) => (d + 2) % 4;
const chebyshevDist = (r1, c1, r2, c2) =>
  Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
const atLeastNAway = (r1, c1, r2, c2, n = 1) =>
  chebyshevDist(r1, c1, r2, c2) >= n + 1;

const move = (r, c, d) => {
  const moves = [
    [r - 1, c], // UP
    [r, c + 1], // RIGHT
    [r + 1, c], // DOWN
    [r, c - 1], // LEFT
  ];
  return moves[d];
};

const keyToArrow = {
  w: "ArrowUp",
  W: "ArrowUp",
  s: "ArrowDown",
  S: "ArrowDown",
  a: "ArrowLeft",
  A: "ArrowLeft",
  d: "ArrowRight",
  D: "ArrowRight",
};

const arrowToDir = {
  ArrowUp: UP,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowRight: RIGHT,
};

const drawCell = (ctx, r, c, fill, cellSize = CELL) => {
  ctx.fillStyle = fill;
  ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
};

const clearCell = (ctx, r, c, cellSize = CELL) =>
  ctx.clearRect(c * cellSize, r * cellSize, cellSize, cellSize);

export default function Snek() {
  const { isColorBlindMode } = useColorBlindMode();
  const [points, setPoints] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setPlaying] = useState(0);
  const [windowWidth, setWindowWidth] = useState(0);
  const [hueRotateDeg, setHueRotateDeg] = useState(0);

  // Timing
  const rafId = useRef(null);
  const stepMs = useRef(TICK_SPEED_MS);
  const loopRunning = useRef(false);

  // Game state
  const direction = useRef(RIGHT);
  const nextDirection = useRef(RIGHT);
  const snek = useRef([]); // [{row,col}]
  const snekSet = useRef(new Set()); // indices
  const foodCoords = useRef({ row: -1, col: -1 });
  const playingRef = useRef(false);
  const gameOverRef = useRef(false);

  // Obstacles
  const obstacles = useRef([]); // [{row,col}]
  const obstacleSet = useRef(new Set()); // indices
  const blockedMask = useRef(new Uint8Array(ROWs * COLs)); // adjacency counts

  // Input queue
  const inputQueue = useRef([]);
  const MAX_QUEUE = 3;

  const clickSFX = useMemo(() => new PersonalAudio(clickNoise), []);
  const gameOverSFX = useMemo(() => new PersonalAudio(gameOverNoise), []);
  const gameMusic = useMemo(() => new PersonalAudio(gameMusicNoise, true), []);

  const isMobile = windowWidth <= 768;

  const markAdjAround = useCallback((r, c, delta) => {
    for (let rr = r - 1; rr <= r + 1; rr++) {
      for (let cc = c - 1; cc <= c + 1; cc++) {
        if (rr < 0 || cc < 0 || rr >= ROWs || cc >= COLs) continue;
        const i = idxOf(rr, cc);
        const next = blockedMask.current[i] + delta;
        blockedMask.current[i] = next < 0 ? 0 : next;
      }
    }
  }, []);

  // ===== Canvas setup =====
  const boardRef = useRef(null);
  const bgRef = useRef(null); // transparent: grid + obstacles
  const dynRef = useRef(null); // transparent: snake + food
  const bgCtx = useRef(null);
  const dynCtx = useRef(null);

  const colors = useMemo(
    () =>
      isColorBlindMode
        ? {
            grid: "rgba(255,255,255,0.3)",
            obstacle: "rgba(255,255,255,0.3)",
            food: "#3cff00",
            body: "#ffffff",
            head: "#ffffff",
            headKO: "#ff4d4f",
          }
        : {
            grid: "rgba(233,233,242,0.55)",
            obstacle: "rgba(28, 28, 28, 0.9)",
            food: "#3cff00",
            body: "#ffffff",
            head: "#ffffff",
            headKO: "#ff4d4f",
          },
    [isColorBlindMode]
  );

  const setCanvasSize = useCallback(
    (canvas, wCSS, hCSS, { alpha } = { alpha: true }) => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const needResize =
        canvas.width !== wCSS * dpr || canvas.height !== hCSS * dpr;
      if (needResize) {
        canvas.width = wCSS * dpr;
        canvas.height = hCSS * dpr;
        canvas.style.width = `${wCSS}px`;
        canvas.style.height = `${hCSS}px`;
      }
      const ctx = canvas.getContext("2d", { alpha });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    },
    []
  );

  const drawGrid = useCallback(
    (ctx) => {
      // dotted grid
      ctx.save();
      ctx.strokeStyle = colors.grid;
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 0; r <= ROWs; r++) {
        const y = r * CELL + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(BOARD_W, y);
      }
      for (let c = 0; c <= COLs; c++) {
        const x = c * CELL + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, BOARD_H);
      }
      ctx.stroke();
      ctx.restore();
    },
    [colors.grid]
  );

  const drawObstacle = useCallback(
    (r, c) => {
      if (bgCtx.current) drawCell(bgCtx.current, r, c, colors.obstacle);
    },
    [colors.obstacle]
  );

  const drawFood = useCallback(() => {
    const f = foodCoords.current;
    if (dynCtx.current && f.row >= 0)
      drawCell(dynCtx.current, f.row, f.col, colors.food);
  }, [colors.food]);

  const eraseFood = useCallback(() => {
    const f = foodCoords.current;
    if (!dynCtx.current || f.row < 0) return;
    // if head is here, don't clear (avoids flicker even if called late)
    const head = snek.current[snek.current.length - 1];
    if (head && head.row === f.row && head.col === f.col) return;
    clearCell(dynCtx.current, f.row, f.col);
  }, []);

  const drawSnake = useCallback(() => {
    if (!dynCtx.current || !snek.current.length) return;
    const snake = snek.current;
    for (let i = 0; i < snake.length - 1; i++) {
      drawCell(dynCtx.current, snake[i].row, snake[i].col, colors.body);
    }
    const head = snake[snake.length - 1];
    const headColor = gameOverRef.current ? colors.headKO : colors.head;
    drawCell(dynCtx.current, head.row, head.col, headColor);
  }, [colors.body, colors.head, colors.headKO]);

  const drawSnakeInitial = drawSnake;

  // ===== Input helpers =====

  const getNextDirection = useCallback((key) => {
    const arrow = keyToArrow[key] || key;
    const want = arrowToDir[arrow];
    if (want == null || want === opposite(direction.current)) return null;
    return want;
  }, []);

  const enqueueDir = (next) => {
    if (next == null) return;
    const queue = inputQueue.current;
    const lastEffective = queue.length
      ? queue[queue.length - 1]
      : nextDirection.current ?? direction.current;
    if (
      next === opposite(lastEffective) ||
      (queue.length && queue[queue.length - 1] === next) ||
      queue.length >= MAX_QUEUE
    )
      return;
    queue.push(next);
  };

  // ===== Spawn rules =====
  const isCellFreeOfSnake = useCallback(
    (r, c) => !snekSet.current.has(idxOf(r, c)),
    []
  );
  const isCellFreeOfObstacles = useCallback(
    (r, c) => !obstacleSet.current.has(idxOf(r, c)),
    []
  );
  const isCellFarFromAllObstacles = useCallback(
    (r, c) => blockedMask.current[idxOf(r, c)] === 0,
    []
  );
  const isCellFarFromFood = useCallback((r, c) => {
    const f = foodCoords.current;
    if (f.row < 0) return true;
    return atLeastNAway(r, c, f.row, f.col, 1);
  }, []);
  const isCellFarFromSnekHead = useCallback((r, c) => {
    if (!snek.current.length) return true;
    const head = snek.current[snek.current.length - 1];
    return atLeastNAway(r, c, head.row, head.col, 5);
  }, []);

  const validFoodCell = useCallback(
    (r, c) =>
      isCellFreeOfSnake(r, c) &&
      isCellFarFromSnekHead(r, c) &&
      isCellFreeOfObstacles(r, c) &&
      isCellFarFromAllObstacles(r, c),
    [
      isCellFreeOfSnake,
      isCellFarFromSnekHead,
      isCellFreeOfObstacles,
      isCellFarFromAllObstacles,
    ]
  );

  const validObstacleCell = useCallback(
    (r, c) =>
      isCellFreeOfSnake(r, c) &&
      isCellFreeOfObstacles(r, c) &&
      isCellFarFromAllObstacles(r, c) &&
      isCellFarFromFood(r, c),
    [
      isCellFreeOfSnake,
      isCellFreeOfObstacles,
      isCellFarFromAllObstacles,
      isCellFarFromFood,
    ]
  );

  const spawnObstacle = useCallback(() => {
    let r,
      c,
      tries = 0;
    do {
      r = (Math.random() * ROWs) | 0;
      c = (Math.random() * COLs) | 0;
      if (++tries > 300) return;
    } while (!validObstacleCell(r, c));

    obstacles.current.push({ row: r, col: c });
    obstacleSet.current.add(idxOf(r, c));
    drawObstacle(r, c);
    markAdjAround(r, c, +1);
  }, [validObstacleCell, drawObstacle, markAdjAround]);

  const populateFoodBall = useCallback(() => {
    let r,
      c,
      tries = 0;
    do {
      r = (Math.random() * ROWs) | 0;
      c = (Math.random() * COLs) | 0;
      if (++tries > 200) break;
    } while (!validFoodCell(r, c));
    eraseFood();
    foodCoords.current = { row: r, col: c };
    drawFood();
  }, [validFoodCell, eraseFood, drawFood]);

  const eatFood = useCallback(() => {
    setPoints((prevPoints) => {
      const newPoints = prevPoints + 1;

      if (!isColorBlindMode && newPoints % POINTS_PER_LEVEL === 0) {
        setHueRotateDeg((deg) =>
          deg === 0
            ? Math.floor(Math.random() * (360 - (deg + 43.5)))
            : deg + 43.5
        );
      }

      if (newPoints >= POINTS_PER_LEVEL && newPoints % POINTS_PER_LEVEL === 0) {
        spawnObstacle();
        spawnObstacle();
      }

      return newPoints;
    });

    populateFoodBall();
  }, [isColorBlindMode, spawnObstacle, populateFoodBall]);

  // ===== Init / Reset =====
  const initGame = useCallback(() => {
    // Reset game state
    snek.current = [];
    snekSet.current = new Set();
    obstacles.current = [];
    obstacleSet.current = new Set();
    blockedMask.current = new Uint8Array(ROWs * COLs);

    // Canvases (bg = grid + obstacles, dyn = snake + food, both transparent)
    if (bgRef.current && dynRef.current) {
      bgCtx.current = setCanvasSize(bgRef.current, BOARD_W, BOARD_H, {
        alpha: true,
      });
      dynCtx.current = setCanvasSize(dynRef.current, BOARD_W, BOARD_H, {
        alpha: true,
      });
      bgCtx.current.clearRect(0, 0, BOARD_W, BOARD_H);
      drawGrid(bgCtx.current);
      dynCtx.current.clearRect(0, 0, BOARD_W, BOARD_H);
    }

    // Seed snake left-to-right on top row
    for (let i = 0; i < DEFAULT_SNEK_LENGTH; i++) {
      snek.current.push({ row: 0, col: i });
      snekSet.current.add(idxOf(0, i));
    }

    // Audio
    gameOverSFX.volume = 1;
    clickSFX.volume = 1;
    gameMusic.volume = 1;

    setGameOver(false);
    setPoints(0);
    direction.current = RIGHT;
    nextDirection.current = RIGHT;
    inputQueue.current = [];
    playingRef.current = false;
    gameOverRef.current = false;

    drawSnakeInitial();
    populateFoodBall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clickSFX,
    gameMusic,
    gameOverSFX,
    populateFoodBall,
    drawGrid,
    drawSnakeInitial,
  ]);

  // ===== Loop control =====
  const startLoop = () => {
    if (loopRunning.current) return;
    loopRunning.current = true;

    let last = performance.now();
    let acc = 0;

    const loop = (now) => {
      if (!loopRunning.current) return;
      acc += now - last;
      last = now;

      const step = stepMs.current;
      while (acc >= step) {
        tickSnek();
        acc -= step;
      }
      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
  };

  const stopLoop = () => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    loopRunning.current = false;
  };

  const startGame = () => {
    stopLoop();
    initGame();
    setPlaying(1);
    playingRef.current = true;
    gameOverRef.current = false;
    gameMusic.play();
    startLoop();
  };

  const paintHeadKO = useCallback(() => {
    if (!dynCtx.current || !snek.current.length) return;
    const head = snek.current[snek.current.length - 1];
    drawCell(dynCtx.current, head.row, head.col, colors.headKO);
  }, [colors.headKO]);

  const stopGame = () => {
    setGameOver(true);
    setHueRotateDeg(0);
    gameOverSFX.play();
    gameMusic.reset();
    setPlaying(0);
    playingRef.current = false;
    gameOverRef.current = true;
    inputQueue.current = [];
    paintHeadKO();
    stopLoop();
  };

  // ===== Collision & Tick =====
  const collisionDetected = useCallback((r, c) => {
    if (outOfBounds(r, c)) return "wall";
    if (obstacleSet.current.has(idxOf(r, c))) return "wall";
    if (snekSet.current.has(idxOf(r, c))) return "self";
    return false;
  }, []);

  const tickSnek = useCallback(() => {
    if (!playingRef.current || gameOverRef.current) return;

    if (inputQueue.current.length) {
      nextDirection.current = inputQueue.current.shift();
    }
    direction.current = nextDirection.current;

    const head = snek.current[snek.current.length - 1];
    const [nr, nc] = move(head.row, head.col, direction.current);

    const ate = nr === foodCoords.current.row && nc === foodCoords.current.col;

    // detect collision before drawing
    const colType = collisionDetected(nr, nc);
    if (colType) {
      stopGame();
      return;
    }

    // if we're going to eat, clear the food pixel BEFORE drawing the new head
    if (ate) eraseFood();

    // repaint old head as body
    drawCell(dynCtx.current, head.row, head.col, colors.body);

    // push/draw new head
    snek.current.push({ row: nr, col: nc });
    snekSet.current.add(idxOf(nr, nc));
    drawCell(dynCtx.current, nr, nc, colors.head);

    if (ate) {
      eatFood();
    } else {
      // pop tail
      const tail = snek.current.shift();
      snekSet.current.delete(idxOf(tail.row, tail.col));
      clearCell(dynCtx.current, tail.row, tail.col); // transparent hole shows bg grid
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collisionDetected, eraseFood, colors.body, colors.head, eatFood]);

  const redrawBoard = useCallback(() => {
    if (!bgCtx.current || !dynCtx.current) return;
    bgCtx.current.clearRect(0, 0, BOARD_W, BOARD_H);
    drawGrid(bgCtx.current);
    for (const o of obstacles.current) {
      drawObstacle(o.row, o.col);
    }
    dynCtx.current.clearRect(0, 0, BOARD_W, BOARD_H);
    drawSnake();
    drawFood();
  }, [drawGrid, drawObstacle, drawSnake, drawFood]);

  // ===== Effects =====
  // throttle resize + keep canvases crisp
  useLayoutEffect(() => {
    let raf = 0;
    const updateSize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setWindowWidth(window.innerWidth);
        if (bgRef.current && dynRef.current) {
          bgCtx.current = setCanvasSize(bgRef.current, BOARD_W, BOARD_H, {
            alpha: true,
          });
          dynCtx.current = setCanvasSize(dynRef.current, BOARD_W, BOARD_H, {
            alpha: true,
          });
          redrawBoard();
        }
      });
    };
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateSize);
    };
    // eslint-disable-next-line
  }, [redrawBoard]);

  // keyboard input
  useEffect(() => {
    const onKeydown = (e) => {
      const d = getNextDirection(e.key);
      enqueueDir(d);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line
  }, [getNextDirection]);

  useEffect(() => {
    const app = document.getElementById("app-base");
    if (app) {
      app.style.filter = isColorBlindMode
        ? "none"
        : `hue-rotate(${hueRotateDeg}deg)`;
    }
  }, [hueRotateDeg, isColorBlindMode]);

  useEffect(() => {
    redrawBoard();
    // eslint-disable-next-line
  }, [isColorBlindMode, redrawBoard]);

  // pause when hidden
  useEffect(() => {
    const onVis = () =>
      document.hidden ? stopLoop() : playingRef.current && startLoop();
    document.addEventListener("visibilitychange", onVis, { passive: true });
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      gameOverSFX.volume = 0;
      clickSFX.volume = 0;
      gameMusic.volume = 0;
      gameMusic.currentTime = 0;
      stopLoop();
    };
  }, [gameOverSFX, clickSFX, gameMusic]);

  // seed game (don’t start loop)
  useEffect(() => {
    initGame();
  }, [initGame]);

  // Show "desktop only" message on mobile
  if (isMobile) {
    return <Wip />;
  }

  return (
    <>
      <ColorBlindToggle />
      <div
        id="app-base"
        className={`snek-colors ${isColorBlindMode ? "colorblind-mode" : ""}`}
      >
        <div
          className="game-container"
          style={{ cursor: isPlaying ? "none" : "inherit" }}
        >
          <h1
            className="snek-title"
            style={{ display: isPlaying || gameOver ? "none" : "block" }}
          >
            SNEK
          </h1>

          {!isPlaying && (
            <button
              onMouseDown={() => clickSFX.play()}
              onClick={() => {
                if (!loopRunning.current) startGame();
              }}
              disabled={loopRunning.current}
            >
              {gameOver ? "try again" : "start game"}
            </button>
          )}

          <div
            id="board-wrap"
            className="board"
            ref={boardRef}
            style={{
              display: isPlaying || gameOver ? "block" : "none",
              position: "absolute",
              width: BOARD_W,
              height: BOARD_H,
            }}
          >
            {/* Transparent bg canvas: dotted grid + obstacles */}
            <canvas
              ref={bgRef}
              width={BOARD_W}
              height={BOARD_H}
              style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }}
            />
            {/* Transparent dynamic canvas: snake + food */}
            <canvas
              ref={dynRef}
              width={BOARD_W}
              height={BOARD_H}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                background: "transparent",
                zIndex: 2,
                imageRendering: "pixelated",
              }}
            />

            {gameOver && (
              <div className="game-over" style={{ zIndex: 3 }}>
                <p className="game-over-text">
                  <span>GAME OVER </span>
                </p>
                <p className="game-over-text second">
                  <span>GAME OVER </span>
                </p>
              </div>
            )}
          </div>

          <p
            className="score"
            style={{ display: isPlaying || gameOver ? "block" : "none" }}
          >
            {points}
          </p>
        </div>
      </div>
    </>
  );
}
