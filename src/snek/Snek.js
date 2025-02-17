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

const UP = Symbol("up");
const DOWN = Symbol("down");
const RIGHT = Symbol("right");
const LEFT = Symbol("left");

export default function Snek() {
  const [points, setPoints] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setPlaying] = useState(0);
  const [dirKey, setDirKey] = useState("ArrowRight");
  const [windowWidth, setWindowWidth] = useState(0);
  const [hueRotateDeg, setHueRotateDeg] = useState(0);

  const timer = useRef(null);
  const grid = useRef(Array(ROWs).fill(Array(COLs).fill("")));
  const snekCoordinates = useRef([]);
  const foodCoords = useRef({ row: -1, col: -1 });
  const direction = useRef(RIGHT);
  const nextDirection = useRef(RIGHT);
  const joystick = useRef();

  const clickSFX = useMemo(() => new PersonalAudio(clickNoise), []);
  const gameOverSFX = useMemo(() => new PersonalAudio(gameOverNoise), []);
  const gameMusic = useMemo(() => new PersonalAudio(gameMusicNoise, true), []);

  const isMobile = windowWidth <= 768;

  const cellsEq = (coords1, coords2) => coords1?.row === coords2?.row && coords1?.col === coords2?.col;
  const isSnekCell = useCallback((cell) => snekCoordinates.current.some((c) => cellsEq(c, cell)), [])

  const getNextDirection = useCallback((key) => {
    let availableTurns;
    switch (direction.current) {
      case UP: case DOWN:
        availableTurns = { "ArrowRight": RIGHT, "ArrowLeft": LEFT };
        break;
      case RIGHT: case LEFT:
        availableTurns = { "ArrowUp": UP, "ArrowDown": DOWN, };
        break;
      default:
        availableTurns = {};
    };
    switch (key) {
      case 'w': case 'W': case Direction.Top: key = "ArrowUp"; break;
      case 's': case 'S': case Direction.Bottom: key = "ArrowDown"; break;
      case 'a': case 'A': case Direction.Left: key = "ArrowLeft"; break;
      case 'd': case 'D': case Direction.Right: key = "ArrowRight"; break;
      default: break;
    }
    return availableTurns[key] || direction.current;
  }, [direction]);

  const moveLeft = (snekHead) => { return { ...snekHead, col: snekHead.col - 1 } };
  const moveRight = (snekHead) => { return { ...snekHead, col: snekHead.col + 1 } };
  const moveUp = (snekHead) => { return { ...snekHead, row: snekHead.row - 1 } };
  const moveDown = (snekHead) => { return { ...snekHead, row: snekHead.row + 1 } };

  const eatFood = () => {
    setPoints((points) => points + 1);
    populateFoodBall();
  }

  const tickSnek = () => {
    if (gameOver) return;

    setPlaying((s) => s + 1);

    const coords = structuredClone(snekCoordinates.current);
    const snekTail = coords[0];
    let snekHead = coords.pop();
    direction.current = nextDirection.current;

    const move_dir = nextDirection.current;

    const foodConsumed =
      snekHead.row === foodCoords.current.row &&
      snekHead.col === foodCoords.current.col;

    if (foodConsumed) eatFood(coords, snekHead);

    coords.forEach((_, idx) => {
      if (idx === coords.length - 1) {
        coords[idx] = { ...snekHead };
        coords[idx].isHead = false;
        return;
      }
      coords[idx] = coords[idx + 1];
    });

    switch (move_dir) {
      case UP: snekHead = moveUp(snekHead); break;
      case DOWN: snekHead = moveDown(snekHead); break;
      case RIGHT: snekHead = moveRight(snekHead); break;
      case LEFT: snekHead = moveLeft(snekHead); break;
      default: break;
    }

    const collisionType = collisionDetected(snekHead);
    if (collisionType === 'wall') return stopGame();
    if (collisionType === 'self') stopGame();

    coords.push(snekHead);
    snekCoordinates.current = foodConsumed ? [snekTail, ...coords] : coords;
  };

  const collisionDetected = (snekHead) => {
    const collidedWithWall =
      snekHead.col >= COLs ||
      snekHead.row >= ROWs ||
      snekHead.col < 0 ||
      snekHead.row < 0;

    const collidedWithSelf = isSnekCell(snekHead);

    return collidedWithSelf ? 'self' : collidedWithWall ? 'wall' : false;
  };

  const getCell = useCallback(
    (row, col) => {
      const coords = { row, col };

      const isFood = cellsEq(coords, foodCoords.current);
      const isHead = cellsEq(snekCoordinates.current[snekCoordinates.current.length - 1], coords);
      const isSnekBody = isHead || isSnekCell(coords);

      let className = "cell";
      if (isFood) className += " food";
      if (isSnekBody) className += " body";
      if (isHead) className += gameOver ? " head-game-over" : " head";

      return <div key={col} className={className}></div>;
    }, [gameOver, isSnekCell]
  );

  const populateFoodBall = async () => {
    const row = Math.floor(Math.random() * ROWs);
    const col = Math.floor(Math.random() * COLs);
    foodCoords.current = { row, col };
  };

  const onStartButtonPress = () => clickSFX.play();

  const rotateHue = useCallback(() => setHueRotateDeg((d) => d + 50), []);

  const initGame = useCallback(() => {
    const snek_postions = [];
    for (let i = 0; i < DEFAULT_SNEK_LENGTH; i++) {
      snek_postions.push({ row: 0, col: i, isHead: false });
    }

    snek_postions[DEFAULT_SNEK_LENGTH - 1].isHead = true;
    snekCoordinates.current = snek_postions;

    gameOverSFX.volume = 1;
    clickSFX.volume = 1;
    gameMusic.volume = 1;
    populateFoodBall();
    setGameOver(false);
    setPoints(0);
    direction.current = RIGHT;
    nextDirection.current = RIGHT;
  }, [clickSFX, gameMusic, gameOverSFX])

  const startGame = async () => {
    initGame();
    joystick.current = JoystickControls;
    timer.current = setInterval(() => tickSnek(), TICK_SPEED_MS);
  };

  const stopGame = async () => {
    setGameOver(true);
    setHueRotateDeg(0);
    gameOverSFX.play();
    gameMusic.reset();
    setPlaying(0);
    if (timer.current) clearInterval(timer.current);
  };

  // update window width to detect mobile
  useLayoutEffect(() => {
    const updateSize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', updateSize);
    updateSize();

    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // change snake direction on key press
  useEffect(() => {
    const onKeydown = (e) => nextDirection.current = getNextDirection(e.key);
    window.addEventListener("keydown", onKeydown);
    // return window.removeEventListener("keydown", onKeydown);
  }, [getNextDirection, isMobile]);

  // change snake direction on keypad press
  useEffect(() => {
    if (!isMobile) return;
    nextDirection.current = getNextDirection(dirKey);
  }, [dirKey, getNextDirection, isMobile]);

  // set new hue rotation
  useEffect(() => {
    const appBase = document.getElementById('app-base');
    appBase.style.filter = `hue-rotate(${hueRotateDeg}deg)`;
  }, [hueRotateDeg]);

  // trigger hue rotation when the score progresses sufficiently
  useEffect(() => {
    if (points % 5 !== 0 || !isPlaying) return;
    rotateHue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, rotateHue]);

  // play game music when game starts
  useEffect(() => {
    if (!isPlaying || gameOver) return;
    gameMusic.play();
  }, [gameMusic, gameOver, isPlaying])

  // clean up noises when we navigate away
  useEffect(() => {
    return () => {
      gameOverSFX.volume = 0;
      clickSFX.volume = 0;
      gameMusic.volume = 0;
      gameMusic.currentTime = 0;
    }
  }, [gameOverSFX, clickSFX, gameMusic]);

  // start up game!
  useEffect(() => initGame(), [initGame]);

  return (
    <>
      <div id='app-base' className={`snek-colors`}>
        <div className="game-container">
          <h1 className='snek-title' style={{ display: isPlaying || gameOver ? 'none' : 'block' }}>
            SNEK
          </h1>
          {!isPlaying &&
            <button onMouseDown={onStartButtonPress} onClick={startGame}>
              {gameOver ? 'main menu' : 'start game'}
            </button>
          }
          <div
            className="board"
            style={{ display: isPlaying || gameOver ? 'block' : 'none' }}
          >
            {grid.current?.map((row, row_idx) => (
              <div key={row_idx} className="row">
                {row.map((_, col_idx) => getCell(row_idx, col_idx))}
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
