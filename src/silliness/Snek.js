import { useCallback, useEffect, useRef, useState, useMemo, useLayoutEffect } from "react";

import clickNoise from '../assets/groovy_click.mp3';
import gameOverNoise from '../assets/game_over.mp3';
import gameMusicNoise from '../assets/the_gathering.mp3';

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
    const timer = useRef(null);
    const grid = useRef(Array(ROWs).fill(Array(COLs).fill("")));
    const snekCoordinates = useRef([]);
    const snekCoordinatesMap = useRef(new Set());
    const foodCoords = useRef({row: -1, col: -1});
    const direction = useRef(RIGHT);
    const nextDirection = useRef(RIGHT);
    const thumbPad = useRef();
    const [points, setPoints] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setPlaying] = useState(0);
    const [dirKey, setDirKey] = useState("ArrowRight");
    const [windowWidth, setWindowWidth] = useState(0);
    const [hueRotateDeg, setHueRotateDeg] = useState(0);

    const clickSFX = useMemo(() => new Audio(clickNoise), []);
    const gameOverSFX = useMemo(() => new Audio(gameOverNoise), []);
    const gameMusic = useMemo(() => new Audio(gameMusicNoise), []);
    gameMusic.loop = true;

    const isMobile = windowWidth <= 768;

    const getNextDirection = useCallback((key) => {
        let availableTurns;
        key = { "w": "ArrowUp", "s": "ArrowDown", "a": "ArrowLeft", "d": "ArrowRight" }[key.toLowerCase()] || key;
        switch(direction.current) {
            case UP: case DOWN: 
                availableTurns = {"ArrowRight": RIGHT, "ArrowLeft": LEFT};
                break;
            case RIGHT: case LEFT: 
                availableTurns = {"ArrowUp": UP, "ArrowDown": DOWN,};
                break;
            default:
                availableTurns = {};
        };
        return availableTurns[key] || direction.current;
    }, [direction]);

    const initGame = useCallback(() => {
        const snek_postions = [];
        for (let i = 0; i < DEFAULT_SNEK_LENGTH; i++) {
            snek_postions.push({ row: 0, col: i, isHead: false});
        }

        snek_postions[DEFAULT_SNEK_LENGTH - 1].isHead = true;
        snekCoordinates.current = snek_postions;

        gameOverSFX.volume = 1;
        clickSFX.volume = 1;
        gameMusic.volume = 1;
        syncSnekCoordinatesMap();
        populateFoodBall();
        setGameOver(false);
        setPoints(0);
        direction.current = RIGHT;
        nextDirection.current = RIGHT;
    }, [clickSFX, gameMusic, gameOverSFX])

    const syncSnekCoordinatesMap = () => {
        const snekCoordsSet = new Set(
            snekCoordinates.current.map((coord) => `${coord.row}:${coord.col}`)
        );
        snekCoordinatesMap.current = snekCoordsSet;
    };

    const eatFood = () => {
        setPoints((points) => points + 1);
        populateFoodBall();
    }

    const tickSnek = () => {
        if (gameOver) return;

        setPlaying((s) => s + 1);

        const coords = snekCoordinates.current;
        const snekTail = coords[0];
        const snekHead = coords.pop();
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
            case UP:
                snekHead.row -= 1;
                break;
            case DOWN:
                snekHead.row += 1;
                break;
            case RIGHT:
                snekHead.col += 1;
                break;
            case LEFT:
                snekHead.col -= 1;
                break;
            default:
                break;
        }

        if (collisionDetected(snekHead)) return stopGame();

        coords.push(snekHead);
        snekCoordinates.current = foodConsumed ? [snekTail, ...coords] : coords;
        syncSnekCoordinatesMap();
    };

    const collisionDetected = (snekHead) => {
        const collidedWithWall = 
            snekHead.col >= COLs ||
            snekHead.row >= ROWs ||
            snekHead.col < 0 ||
            snekHead.row < 0;

        const collidedWithSelf = snekCoordinatesMap.current.has(
            `${snekHead.row}:${snekHead.col}`
        );

        return collidedWithSelf || collidedWithWall;
    };

    const getCell = useCallback(
        (row_idx, col_idx) => {
            const coords = `${row_idx}:${col_idx}`;
            const foodPos = `${foodCoords.current.row}:${foodCoords.current.col}`;
            const head = snekCoordinates.current[snekCoordinates.current.length - 1];
            const headPos = `${head?.row}:${head?.col}`;

            const isFood = coords === foodPos;
            const isSnekBody = snekCoordinatesMap.current.has(coords);
            const isHead = headPos === coords;

            let className = "cell";
            if (isFood) className += " food";
            if (isSnekBody) className += " body";
            if (isHead) className += " head";

            return <div key={col_idx} className={className}></div>;
        }, []
    );

    const populateFoodBall = async () => {
        const row = Math.floor(Math.random() * ROWs);
        const col = Math.floor(Math.random() * COLs);
        foodCoords.current = {row, col};
    };

    const makeThumbPad = () => {
        return (
            <div className="thumb-pad">
                <div className="thumb-pad-top">
                    <div onMouseDown={() => setDirKey("ArrowUp")} className="dir-button">⇧</div>
                </div>
                <div className="thumb-pad-middle">
                    <div onMouseDown={() => setDirKey("ArrowLeft")} className="dir-button">⇦</div>
                    <div className="dir-button middle"></div>
                    <div onMouseDown={() => setDirKey("ArrowRight")} className="dir-button">⇨</div>
                </div>
                <div className="thumb-pad-bottom">
                    <div onMouseDown={() => setDirKey("ArrowDown")} className="dir-button">⇩</div>
                </div>
            </div>
        );
    };

    const onStartButtonPress = () => clickSFX.play();
    
    const rotateHue = useCallback(() => setHueRotateDeg((d) => d + 50), []);

    const startGame = async () => {
        initGame();
        thumbPad.current = makeThumbPad;
        const interval = setInterval(() => tickSnek(), TICK_SPEED_MS);
        timer.current = interval;
    };

    const stopGame = async () => {
        setGameOver(true);
        setHueRotateDeg(0);
        gameOverSFX.play();
        gameMusic.pause();
        gameMusic.currentTime = 0;
        setPlaying(0);
        if (timer.current) {
            clearInterval(timer.current);
        }
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
        console.log(dirKey)
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
                <h1 className='snek-title' style={{display: isPlaying || gameOver ? 'none' : 'block'}}>
                    SNEK
                </h1>
                { gameOver && <p className='game-over'>GAME OVER</p> }
                {!isPlaying && 
                    <button onMouseDown={onStartButtonPress} onClick={startGame}>
                        {gameOver ? 'main menu' : 'start game'}
                    </button>
                }
                <div 
                    className="board"
                    style={{display: isPlaying || gameOver? 'block' : 'none'}}
                >
                    {grid.current?.map((row, row_idx) => (
                        <div key={row_idx} className="row">
                            {row.map((_, col_idx) => getCell(row_idx, col_idx))}
                        </div>
                    ))}
                </div>
                <p className='score' style={{display: isPlaying || gameOver ? 'block' : 'none'}}>
                    food eaten: {points}
                </p>
            </div>
            {isMobile && isPlaying && thumbPad.current ? <thumbPad.current/> : <></>}
        </div>
        </>
    );
}
