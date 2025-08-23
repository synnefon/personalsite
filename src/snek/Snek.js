import { useCallback, useEffect, useRef, useState, useMemo, useLayoutEffect } from "react";
import { Direction } from 'rc-joystick';
import { JoystickControls } from "./JoystickControls";
import { PersonalAudio } from "../util/Audio"

import clickNoise from '../assets/snek/groovy_click.mp3';
import gameOverNoise from '../assets/snek/game_over.mp3';
import gameMusicNoise from '../assets/snek/the_gathering.mp3';

import '../styles/snek.css'

const COLs = 35;
const ROWs = 20;
const DEFAULT_SNEK_LENGTH = 6;
var TICK_SPEED_MS = 125;

// Directions
const UP = 0;
const RIGHT = 1;
const DOWN = 2;
const LEFT = 3;

const POINTS_PER_LEVEL = 5;

export default function Snek() {
  const [points, setPoints] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setPlaying] = useState(0); // 0 or 1 (kept to minimize UI diffs)
  const [dirKey, setDirKey] = useState("ArrowRight");
  const [windowWidth, setWindowWidth] = useState(0);
  const [hueRotateDeg, setHueRotateDeg] = useState(0);

  // Timing
  const rafId = useRef(null);
  const stepMs = useRef(TICK_SPEED_MS);

  // game state
  const loopRunning = useRef(false);

  // Board refs
  const cellRefs = useRef(
    Array.from({ length: ROWs }, () => Array.from({ length: COLs }, () => null))
  );

  // Game state refs (imperative)
  const direction = useRef(RIGHT);
  const nextDirection = useRef(RIGHT);
  const snek = useRef([]);              // [{row, col}]
  const snekSet = useRef(new Set());    // occupancy set of indices
  const foodCoords = useRef({ row: -1, col: -1 });
  const playingRef = useRef(false);
  const gameOverRef = useRef(false);

  // Obstacles
  const obstacles = useRef([]);           // [{row, col}]
  const obstacleSet = useRef(new Set());  // Set of idx

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
  const atLeastNAway = (r1, c1, r2, c2, n = 1) => chebyshevDist(r1, c1, r2, c2) >= n + 1; // no adjacency (8-neighborhood blocked)


  const setCellClass = (r, c, add, cls) => {
    const el = cellRefs.current[r]?.[c];
    if (!el) return;
    el.classList.toggle(cls, !!add);
  };

  const clearCellToBase = (r, c) => {
    const el = cellRefs.current[r]?.[c];
    if (!el) return;
    el.className = "cell";
  };

  const pushHead = (r, c, isHead = false) => {
    snek.current.push({ row: r, col: c });
    snekSet.current.add(idxOf(r, c));
    setCellClass(r, c, true, "body");
    if (isHead) setCellClass(r, c, true, gameOverRef.current ? "head-game-over" : "head");
  };

  const popTail = () => {
    const tail = snek.current.shift();
    if (!tail) return;
    snekSet.current.delete(idxOf(tail.row, tail.col));
    const el = cellRefs.current[tail.row]?.[tail.col];
    if (el) {
      el.classList.remove("body", "head", "head-game-over");
    }
  };

  const hitsSelf = (r, c) => snekSet.current.has(idxOf(r, c));

  const move = (r, c, d) => (
    d === UP ? [r - 1, c] :
      d === DOWN ? [r + 1, c] :
        d === LEFT ? [r, c - 1] :
          [r, c + 1]
  );

  // Parse an input into a numeric direction (no side-effects)
  const getNextDirection = useCallback((key) => {
    // Convert WASD / joystick to Arrow keys
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

    // Disallow immediate reversal against current motion
    if (want === opposite(direction.current)) return null;

    return want;
  }, []);

  // Enqueue a direction with validation/collapse
  const enqueueDir = (next) => {
    if (next == null) return;

    // last effective direction is last queued, else nextDirection, else current
    const lastEffective =
      inputQueue.current.length
        ? inputQueue.current[inputQueue.current.length - 1]
        : (nextDirection.current ?? direction.current);

    // Disallow 180° reversals relative to last effective
    if (next === opposite(lastEffective)) return;

    // Collapse duplicates
    if (inputQueue.current.length && inputQueue.current[inputQueue.current.length - 1] === next) return;

    if (inputQueue.current.length < MAX_QUEUE) {
      inputQueue.current.push(next);
    }
  };

  // ----- Spawning rules helpers -----
  const isCellFreeOfSnake = (r, c) => !snekSet.current.has(idxOf(r, c));
  const isCellFreeOfObstacles = (r, c) => !obstacleSet.current.has(idxOf(r, c));
  const isCellFarFromAllObstacles = (r, c) => {
    for (const o of obstacles.current) {
      if (!atLeastNAway(r, c, o.row, o.col, 1)) return false;
    }
    return true;
  };
  const isCellFarFromFood = (r, c) => {
    const f = foodCoords.current;
    if (f.row < 0) return true;
    return atLeastNAway(r, c, f.row, f.col, 1);
  };
  const isCellFarFromSnekHead = (r, c) => {
    if (!snek.current.length) return true; // no snake yet
    const head = snek.current[snek.current.length - 1];
    return atLeastNAway(r, c, head.row, head.col, 5);
  };

  // Food must not be on snake or obstacle, and must be >=1 away from every obstacle.
  const validFoodCell = (r, c) =>
    isCellFreeOfSnake(r, c) &&
    isCellFarFromSnekHead(r, c) && 
    isCellFreeOfObstacles(r, c) &&
    isCellFarFromAllObstacles(r, c);

  // Obstacle must not be on snake or obstacle, must be >=1 away from every obstacle, and >=1 away from the food.
  const validObstacleCell = (r, c) =>
    isCellFreeOfSnake(r, c) &&
    isCellFreeOfObstacles(r, c) &&
    isCellFarFromAllObstacles(r, c) &&
    isCellFarFromFood(r, c);

  const eatFood = () => {
    setPoints((p) => {
      const next = p + 1;
      if (next % POINTS_PER_LEVEL === 0) setHueRotateDeg((d) => d + 43.5);
      if (next >= POINTS_PER_LEVEL && next % POINTS_PER_LEVEL === 0) {
        // spawn obstacles at 15, 30, 45, ...
        spawnObstacle();
      }
      return next;
    });
    populateFoodBall();
  };

  const populateFoodBall = useCallback(() => {
    let r, c;
    let tries = 0;
    do {
      r = (Math.random() * ROWs) | 0;
      c = (Math.random() * COLs) | 0;
      tries++;
      if (tries > 200) break; // safety valve
    } while (!validFoodCell(r, c));
    // clear old food
    if (foodCoords.current.row >= 0) {
      setCellClass(foodCoords.current.row, foodCoords.current.col, false, "food");
    }
    foodCoords.current = { row: r, col: c };
    setCellClass(r, c, true, "food");
  }, []);

  const spawnObstacle = () => {
    let r, c;
    let tries = 0;
    do {
      r = (Math.random() * ROWs) | 0;
      c = (Math.random() * COLs) | 0;
      tries++;
      if (tries > 300) return; // couldn't find a slot; skip this level
    } while (!validObstacleCell(r, c));

    // record & render
    obstacles.current.push({ row: r, col: c });
    obstacleSet.current.add(idxOf(r, c));
    setCellClass(r, c, true, "obstacle");
  };

  const onStartButtonPress = () => clickSFX.play();

  const initBoardClasses = () => {
    for (let r = 0; r < ROWs; r++) {
      for (let c = 0; c < COLs; c++) {
        clearCellToBase(r, c);
      }
    }
  };

  const initGame = useCallback(() => {
    // reset classes and state
    initBoardClasses();
    snek.current = [];
    snekSet.current = new Set();

    // obstacles reset
    obstacles.current = [];
    obstacleSet.current = new Set();

    // seed snake horizontally at (0, 0..DEFAULT_SNEK_LENGTH-1)
    for (let i = 0; i < DEFAULT_SNEK_LENGTH; i++) {
      pushHead(0, i, i === DEFAULT_SNEK_LENGTH - 1);
    }

    // audio vols
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

    populateFoodBall();
  }, [clickSFX, gameMusic, gameOverSFX, populateFoodBall]);

  const startLoop = () => {
    if (loopRunning.current) return;          // guard against duplicates
    loopRunning.current = true;

    let last = performance.now();             // fresh baseline every start
    let acc = 0;

    const loop = (now) => {
      if (!loopRunning.current) return;       // in case we stopped during a frame
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
    stopLoop();                 // ensure no zombie loop from previous game
    initGame();
    joystick.current = JoystickControls;
    setPlaying(1);
    playingRef.current = true;
    gameOverRef.current = false;
    gameMusic.play();
    startLoop();                // now start a single loop
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

    // show head-game-over class on current head
    const head = snek.current[snek.current.length - 1];
    if (head) {
      setCellClass(head.row, head.col, false, "head");
      setCellClass(head.row, head.col, true, "head-game-over");
    }

    stopLoop();
  };

  const collisionDetected = (r, c) => {
    if (outOfBounds(r, c)) return 'wall';
    if (obstacleSet.current.has(idxOf(r, c))) return 'wall';
    if (hitsSelf(r, c)) return 'self';
    return false;
  };

  const tickSnek = () => {
    if (!playingRef.current || gameOverRef.current) return;

    // Consume at most one queued input, then lock it in
    if (inputQueue.current.length) {
      nextDirection.current = inputQueue.current.shift();
    }
    direction.current = nextDirection.current;

    const head = snek.current[snek.current.length - 1];
    const [nr, nc] = move(head.row, head.col, direction.current);

    const colType = collisionDetected(nr, nc);
    if (colType) {
      stopGame();
      return;
    }

    const foodConsumed = (nr === foodCoords.current.row && nc === foodCoords.current.col);

    // demote prior head to body
    setCellClass(head.row, head.col, false, "head");
    setCellClass(head.row, head.col, true, "body");

    // new head
    pushHead(nr, nc, true);

    if (foodConsumed) {
      // remove food and respawn
      setCellClass(foodCoords.current.row, foodCoords.current.col, false, "food");
      eatFood();
    } else {
      // move tail forward
      popTail();
    }
  };

  // update window width to detect mobile
  useLayoutEffect(() => {
    const updateSize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // change snake direction on key press -> enqueue
  useEffect(() => {
    const onKeydown = (e) => {
      const d = getNextDirection(e.key);
      enqueueDir(d);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [getNextDirection]);

  // change snake direction on keypad press (mobile) -> enqueue
  useEffect(() => {
    if (!isMobile) return;
    const d = getNextDirection(dirKey);
    enqueueDir(d);
  }, [dirKey, getNextDirection, isMobile]);

  // set new hue rotation
  useEffect(() => {
    const appBase = document.getElementById('app-base');
    if (appBase) appBase.style.filter = `hue-rotate(${hueRotateDeg}deg)`;
  }, [hueRotateDeg]);

  // clean up noises when we navigate away
  useEffect(() => {
    return () => {
      gameOverSFX.volume = 0;
      clickSFX.volume = 0;
      gameMusic.volume = 0;
      gameMusic.currentTime = 0;
      stopLoop();
    }
  }, [gameOverSFX, clickSFX, gameMusic]);

  // start up game! (initialize board/snake/food but don't start loop)
  useEffect(() => { initGame(); }, [initGame]);

  // Build a static grid once and only once
  const rows = useMemo(() => Array.from({ length: ROWs }), []);
  const cols = useMemo(() => Array.from({ length: COLs }), []);

  return (
    <>
      <div id='app-base' className={`snek-colors`}>
        <div className="game-container">
          <h1 className='snek-title' style={{ display: isPlaying || gameOver ? 'none' : 'block' }}>
            SNEK
          </h1>
          {!isPlaying &&
            <button
              onMouseDown={onStartButtonPress}
              onClick={() => { if (!loopRunning.current) startGame(); }}
              disabled={loopRunning.current}
            >
              {gameOver ? 'main menu' : 'start game'}
            </button>
          }
          <div
            className="board"
            style={{ display: isPlaying || gameOver ? 'block' : 'none' }}
          >
            {rows.map((_, row_idx) => (
              <div key={row_idx} className="row">
                {cols.map((__, col_idx) => (
                  <div
                    key={col_idx}
                    className="cell"
                    ref={el => { cellRefs.current[row_idx][col_idx] = el; }}
                  />
                ))}
              </div>
            ))}
            {gameOver &&
              <div className='game-over'>
                <p className='game-over-text'><span>GAME OVER{' '}</span></p>
                <p className='game-over-text second'><span>GAME OVER{' '}</span></p>
              </div>
            }
          </div>
          <p className='score' style={{ display: isPlaying || gameOver ? 'block' : 'none' }}>
            food eaten: {points}
          </p>
          {isMobile && isPlaying && joystick.current ? <joystick.current setDirection={setDirKey} /> : <></>}
        </div>
      </div>
    </>
  );
}
