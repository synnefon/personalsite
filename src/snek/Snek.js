import { Direction } from 'rc-joystick';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PersonalAudio } from "../util/Audio";
import { JoystickControls } from "./JoystickControls";

import gameOverNoise from '../assets/snek/game_over.mp3';
import clickNoise from '../assets/snek/groovy_click.mp3';
import gameMusicNoise from '../assets/snek/the_gathering.mp3';

import '../styles/snek.css';

const COLs = 35;
const ROWs = 20;
const DEFAULT_SNEK_LENGTH = 6;
var TICK_SPEED_MS = 125;

// Directions
const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
const POINTS_PER_LEVEL = 5;
const CELL = 22; // px per cell

export default function Snek() {
  const [points, setPoints] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setPlaying] = useState(0);
  const [dirKey, setDirKey] = useState("ArrowRight");
  const [windowWidth, setWindowWidth] = useState(0);
  const [hueRotateDeg, setHueRotateDeg] = useState(0);

  // Timing
  const rafId = useRef(null);
  const stepMs = useRef(TICK_SPEED_MS);
  const loopRunning = useRef(false);

  // Game state
  const direction = useRef(RIGHT);
  const nextDirection = useRef(RIGHT);
  const snek = useRef([]);           // [{row,col}]
  const snekSet = useRef(new Set()); // indices
  const foodCoords = useRef({ row: -1, col: -1 });
  const playingRef = useRef(false);
  const gameOverRef = useRef(false);

  // Obstacles
  const obstacles = useRef([]);          // [{row,col}]
  const obstacleSet = useRef(new Set()); // indices
  const blockedMask = useRef(new Uint8Array(ROWs * COLs)); // adjacency counts

  // Input queue
  const inputQueue = useRef([]);
  const MAX_QUEUE = 3;

  const joystick = useRef();

  const clickSFX = useMemo(() => new PersonalAudio(clickNoise), []);
  const gameOverSFX = useMemo(() => new PersonalAudio(gameOverNoise), []);
  const gameMusic = useMemo(() => new PersonalAudio(gameMusicNoise, true), []);

  const isMobile = windowWidth <= 768;

  // Helpers
  const idxOf = (r, c) => r * COLs + c;
  const outOfBounds = (r, c) => (r < 0 || c < 0 || r >= ROWs || c >= COLs);
  const opposite = (d) => (d + 2) % 4;
  const chebyshevDist = (r1, c1, r2, c2) => Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
  const atLeastNAway = (r1, c1, r2, c2, n = 1) => chebyshevDist(r1, c1, r2, c2) >= n + 1;

  const markAdjAround = (r, c, delta) => {
    for (let rr = r - 1; rr <= r + 1; rr++) {
      for (let cc = c - 1; cc <= c + 1; cc++) {
        if (rr < 0 || cc < 0 || rr >= ROWs || cc >= COLs) continue;
        const i = idxOf(rr, cc);
        const next = blockedMask.current[i] + delta;
        blockedMask.current[i] = next < 0 ? 0 : next;
      }
    }
  };

  // ===== Canvas setup =====
  const boardRef = useRef(null);
  const bgRef = useRef(null);   // opaque: board color + grid + obstacles
  const dynRef = useRef(null);  // transparent: snake + food
  const bgCtx = useRef(null);
  const dynCtx = useRef(null);

  const BOARD_W = COLs * CELL;
  const BOARD_H = ROWs * CELL;

  const colors = {
    grid: "rgba(233,233,242,0.55)",
    obstacle: "rgba(233,233,242,0.9)",
    food: "#3cff00",
    body: "#ffffff",
    head: "#ffffff",
    headKO: "#ff4d4f",
  };

  const setCanvasSize = (canvas, wCSS, hCSS, { alpha } = { alpha: true }) => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const needResize = canvas.width !== wCSS * dpr || canvas.height !== hCSS * dpr;
    if (needResize) {
      canvas.width = wCSS * dpr;
      canvas.height = hCSS * dpr;
      canvas.style.width = `${wCSS}px`;
      canvas.style.height = `${hCSS}px`;
    }
    const ctx = canvas.getContext('2d', { alpha });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };

  const getBoardBg = () => {
    const el = boardRef.current;
    if (!el) return 'transparent';
    const bg = getComputedStyle(el).backgroundColor;
    return bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : 'rgb(95, 93, 156)'; // fallback to your CSS var
  };

  const drawCell = (ctx, r, c, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
  };
  const clearCell = (ctx, r, c) => ctx.clearRect(c * CELL, r * CELL, CELL, CELL);

  const drawGrid = (ctx) => {
    // paint the board background color so filters don’t black-box us
    const bg = getBoardBg();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);

    // dotted grid on top
    ctx.save();
    ctx.strokeStyle = colors.grid;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r <= ROWs; r++) {
      const y = r * CELL + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(BOARD_W, y);
    }
    for (let c = 0; c <= COLs; c++) {
      const x = c * CELL + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, BOARD_H);
    }
    ctx.stroke();
    ctx.restore();
  };

  const drawObstacle = (r, c) => bgCtx.current && drawCell(bgCtx.current, r, c, colors.obstacle);
  const drawFood = () => {
    const f = foodCoords.current;
    if (dynCtx.current && f.row >= 0) drawCell(dynCtx.current, f.row, f.col, colors.food);
  };
  const eraseFood = () => {
    const f = foodCoords.current;
    if (!dynCtx.current || f.row < 0) return;
    // if head is here, don't clear (avoids flicker even if called late)
    const head = snek.current[snek.current.length - 1];
    if (head && head.row === f.row && head.col === f.col) return;
    clearCell(dynCtx.current, f.row, f.col);
  };
  const drawSnakeInitial = () => {
    if (!dynCtx.current || !snek.current.length) return;
    for (let i = 0; i < snek.current.length - 1; i++) {
      const { row, col } = snek.current[i];
      drawCell(dynCtx.current, row, col, colors.body);
    }
    const head = snek.current[snek.current.length - 1];
    drawCell(dynCtx.current, head.row, head.col, colors.head);
  };

  // ===== Input helpers =====
  const move = (r, c, d) => (
    d === UP ? [r - 1, c] :
      d === DOWN ? [r + 1, c] :
        d === LEFT ? [r, c - 1] :
          [r, c + 1]
  );

  const getNextDirection = useCallback((key) => {
    switch (key) {
      case 'w': case 'W': case Direction.Top: key = "ArrowUp"; break;
      case 's': case 'S': case Direction.Bottom: key = "ArrowDown"; break;
      case 'a': case 'A': case Direction.Left: key = "ArrowLeft"; break;
      case 'd': case 'D': case Direction.Right: key = "ArrowRight"; break;
      default: break;
    }
    const want =
      key === "ArrowUp" ? UP :
        key === "ArrowDown" ? DOWN :
          key === "ArrowLeft" ? LEFT :
            key === "ArrowRight" ? RIGHT : null;
    if (want == null) return null;
    if (want === opposite(direction.current)) return null; // no 180s
    return want;
  }, []);

  const enqueueDir = (next) => {
    if (next == null) return;
    const lastEffective =
      inputQueue.current.length
        ? inputQueue.current[inputQueue.current.length - 1]
        : (nextDirection.current ?? direction.current);
    if (next === opposite(lastEffective)) return;
    if (inputQueue.current.length && inputQueue.current[inputQueue.current.length - 1] === next) return;
    if (inputQueue.current.length < MAX_QUEUE) inputQueue.current.push(next);
  };

  // ===== Spawn rules =====
  const isCellFreeOfSnake = (r, c) => !snekSet.current.has(idxOf(r, c));
  const isCellFreeOfObstacles = (r, c) => !obstacleSet.current.has(idxOf(r, c));
  const isCellFarFromAllObstacles = (r, c) => blockedMask.current[idxOf(r, c)] === 0;
  const isCellFarFromFood = (r, c) => {
    const f = foodCoords.current;
    if (f.row < 0) return true;
    return atLeastNAway(r, c, f.row, f.col, 1);
  };
  const isCellFarFromSnekHead = (r, c) => {
    if (!snek.current.length) return true;
    const head = snek.current[snek.current.length - 1];
    return atLeastNAway(r, c, head.row, head.col, 5);
  };

  const validFoodCell = (r, c) =>
    isCellFreeOfSnake(r, c) &&
    isCellFarFromSnekHead(r, c) &&
    isCellFreeOfObstacles(r, c) &&
    isCellFarFromAllObstacles(r, c);

  const validObstacleCell = (r, c) =>
    isCellFreeOfSnake(r, c) &&
    isCellFreeOfObstacles(r, c) &&
    isCellFarFromAllObstacles(r, c) &&
    isCellFarFromFood(r, c);

  const eatFood = () => {
    setPoints((p) => {
      const next = p + 1;
      if (next % POINTS_PER_LEVEL === 0) setHueRotateDeg((d) => d + 43.5); // keep the original bump
      if (next >= POINTS_PER_LEVEL && next % POINTS_PER_LEVEL === 0) {
        spawnObstacle();
      }
      return next;
    });
    populateFoodBall();
  };

  const populateFoodBall = useCallback(() => {
    let r, c, tries = 0;
    do {
      r = (Math.random() * ROWs) | 0;
      c = (Math.random() * COLs) | 0;
      tries++;
      if (tries > 200) break;
    } while (!validFoodCell(r, c));
    eraseFood();
    foodCoords.current = { row: r, col: c };
    drawFood();
  }, []);

  const spawnObstacle = () => {
    let r, c, tries = 0;
    do {
      r = (Math.random() * ROWs) | 0;
      c = (Math.random() * COLs) | 0;
      tries++;
      if (tries > 300) return;
    } while (!validObstacleCell(r, c));

    obstacles.current.push({ row: r, col: c });
    obstacleSet.current.add(idxOf(r, c));
    drawObstacle(r, c);
    markAdjAround(r, c, +1);
  };

  // ===== Init / Reset =====
  const initGame = useCallback(() => {
    // Reset game state
    snek.current = [];
    snekSet.current = new Set();
    obstacles.current = [];
    obstacleSet.current = new Set();
    blockedMask.current = new Uint8Array(ROWs * COLs);

    // Canvases (bg = OPAQUE, dyn = TRANSPARENT)
    if (bgRef.current && dynRef.current) {
      bgCtx.current = setCanvasSize(bgRef.current, BOARD_W, BOARD_H, { alpha: false }); // opaque
      dynCtx.current = setCanvasSize(dynRef.current, BOARD_W, BOARD_H, { alpha: true }); // transparent
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
  }, [clickSFX, gameMusic, gameOverSFX, populateFoodBall]);

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

      while (acc >= stepMs.current) {
        tickSnek();
        acc -= stepMs.current;
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

  const startGame = async () => {
    stopLoop();
    initGame();
    joystick.current = JoystickControls;
    setPlaying(1);
    playingRef.current = true;
    gameOverRef.current = false;
    gameMusic.play();
    startLoop();
  };

  const paintHeadKO = () => {
    if (!dynCtx.current || !snek.current.length) return;
    const head = snek.current[snek.current.length - 1];
    drawCell(dynCtx.current, head.row, head.col, colors.headKO);
  };

  const stopGame = async () => {
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
  const collisionDetected = (r, c) => {
    if (outOfBounds(r, c)) return 'wall';
    if (obstacleSet.current.has(idxOf(r, c))) return 'wall';
    if (snekSet.current.has(idxOf(r, c))) return 'self';
    return false;
  };

  const tickSnek = () => {
    if (!playingRef.current || gameOverRef.current) return;

    if (inputQueue.current.length) {
      nextDirection.current = inputQueue.current.shift();
    }
    direction.current = nextDirection.current;

    const head = snek.current[snek.current.length - 1];
    const [nr, nc] = move(head.row, head.col, direction.current);

    const ate = (nr === foodCoords.current.row && nc === foodCoords.current.col);

    // detect collision before drawing
    const colType = collisionDetected(nr, nc);
    if (colType) {
      stopGame();
      return;
    }

    // if we’re going to eat, clear the food pixel BEFORE drawing the new head
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
  };

  // ===== Effects =====
  // throttle resize + keep canvases crisp
  useLayoutEffect(() => {
    let raf = 0;
    const updateSize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setWindowWidth(window.innerWidth);
        if (bgRef.current && dynRef.current) {
          bgCtx.current = setCanvasSize(bgRef.current, BOARD_W, BOARD_H, { alpha: false }); // opaque bg
          dynCtx.current = setCanvasSize(dynRef.current, BOARD_W, BOARD_H, { alpha: true }); // transparent dyn
          drawGrid(bgCtx.current);
          for (const o of obstacles.current) drawObstacle(o.row, o.col);
          dynCtx.current.clearRect(0, 0, BOARD_W, BOARD_H);
          drawSnakeInitial();
          drawFood();
        }
      });
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // keyboard input
  useEffect(() => {
    const onKeydown = (e) => {
      const d = getNextDirection(e.key);
      enqueueDir(d);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [getNextDirection]);

  // mobile joystick input
  useEffect(() => {
    if (!isMobile) return;
    const d = getNextDirection(dirKey);
    enqueueDir(d);
  }, [dirKey, getNextDirection, isMobile]);

  useEffect(() => {
    const app = document.getElementById('app-base');
    if (app) app.style.filter = `hue-rotate(${hueRotateDeg}deg)`;  // <- page bg shifts too
  }, [hueRotateDeg]);

  // pause when hidden
  useEffect(() => {
    const onVis = () => document.hidden ? stopLoop() : (playingRef.current && startLoop());
    document.addEventListener('visibilitychange', onVis, { passive: true });
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      gameOverSFX.volume = 0;
      clickSFX.volume = 0;
      gameMusic.volume = 0;
      gameMusic.currentTime = 0;
      stopLoop();
    }
  }, [gameOverSFX, clickSFX, gameMusic]);

  // seed game (don’t start loop)
  useEffect(() => { initGame(); }, [initGame]);

  return (
    <>
      <div id='app-base' className="snek-colors">
        <div className="game-container">
          <h1 className='snek-title' style={{ display: isPlaying || gameOver ? 'none' : 'block' }}>
            SNEK
          </h1>

          {!isPlaying &&
            <button
              onMouseDown={() => clickSFX.play()}
              onClick={() => { if (!loopRunning.current) startGame(); }}
              disabled={loopRunning.current}
            >
              {gameOver ? 'main menu' : 'start game'}
            </button>
          }

          <div
            id="board-wrap"
            className="board"
            ref={boardRef}
            style={{
              display: isPlaying || gameOver ? 'block' : 'none',
              position: 'absolute',
              width: BOARD_W,
              height: BOARD_H
            }}
          >
            {/* Opaque bg canvas: board color + dotted grid + obstacles */}
            <canvas
              ref={bgRef}
              width={BOARD_W}
              height={BOARD_H}
              style={{ position: 'absolute', left: 0, top: 0, zIndex: 1 }}
            />
            {/* Transparent dynamic canvas: snake + food */}
            <canvas
              ref={dynRef}
              width={BOARD_W}
              height={BOARD_H}
              style={{ position: 'absolute', left: 0, top: 0, background: 'transparent', zIndex: 2, imageRendering: 'pixelated' }}
            />

            {gameOver &&
              <div className='game-over' style={{ zIndex: 3 }}>
                <p className='game-over-text'><span>GAME OVER{' '}</span></p>
                <p className='game-over-text second'><span>GAME OVER{' '}</span></p>
              </div>
            }
          </div>

          <p className='score' style={{ display: isPlaying || gameOver ? 'block' : 'none' }}>
            food eaten: {points}
          </p>

          {isMobile && isPlaying && joystick.current ? <joystick.current setDirection={setDirKey} /> : null}
        </div>
      </div>
    </>
  );
}
