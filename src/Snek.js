import { useCallback, useEffect, useRef, useState } from "react";

import './snek.css'

const COLs = 35;
const ROWs = 17;
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
    const direction = useRef(RIGHT);
    const snekCoordinatesMap = useRef(new Set());
    const foodCoords = useRef({row: -1, col: -1});
    const [points, setPoints] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setPlaying] = useState(0);
    const [invert, setInvert] = useState(false);

    const getNewDirection = useCallback((key) => {
        let availableTurns 
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

    const handleDirectionChange = useCallback((key) => {
      direction.current = getNewDirection(key);
    }, [getNewDirection]);

    useEffect(() => {
        window.addEventListener("keydown", (e) => handleDirectionChange(e.key));
    }, [handleDirectionChange]);

    const initGame = useCallback(() => {
        const snek_postions = [];
        for (let i = 0; i < DEFAULT_SNEK_LENGTH; i++) {
            snek_postions.push({
                row: 0,
                col: i,
                isHead: false,
            });
        }

        snek_postions[DEFAULT_SNEK_LENGTH - 1].isHead = true;
        snekCoordinates.current = snek_postions;

        syncSnekCoordinatesMap();
        populateFoodBall();
        setGameOver(false);
        setPoints(0);
        setInvert(false);
        direction.current = RIGHT;
    }, [])

    useEffect(() => {
       initGame();
    }, [initGame]);

    const syncSnekCoordinatesMap = () => {
        const snekCoordsSet = new Set(
            snekCoordinates.current.map((coord) => `${coord.row}:${coord.col}`)
        );
        snekCoordinatesMap.current = snekCoordsSet;
    };

    const moveSnek = () => {
        if (gameOver) return;

        setPlaying((s) => s + 1);

        const coords = snekCoordinates.current;
        const snekTail = coords[0];
        const snekHead = coords.pop();
        const curr_direction = direction.current;

        const foodConsumed =
            snekHead.row === foodCoords.current.row &&
            snekHead.col === foodCoords.current.col;

        coords.forEach((_, idx) => {
            if (idx === coords.length - 1) {
                coords[idx] = { ...snekHead };
                coords[idx].isHead = false;
                return;
            }

            coords[idx] = coords[idx + 1];
        });

        switch (curr_direction) {
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

        if (foodConsumed) {
            setPoints((points) => points + 1);
            populateFoodBall();
        }

        const collided = collisionCheck(snekHead);
        if (collided) {
            stopGame();
            return;
        }

        coords.push(snekHead);
        snekCoordinates.current = foodConsumed
            ? [snekTail, ...coords]
            : coords;
        syncSnekCoordinatesMap();
    };
    
    useEffect(() => {
        if (points > 0 && points % 10 === 0) {
            setInvert(true)
        }
    }, [points])

    const collisionCheck = (snekHead) => {
        if (
            snekHead.col >= COLs ||
            snekHead.row >= ROWs ||
            snekHead.col < 0 ||
            snekHead.row < 0
        ) {
            return true;
        }

        const coordsKey = `${snekHead.row}:${snekHead.col}`;
        if (snekCoordinatesMap.current.has(coordsKey)) {
            return true;
        }
    };

    const populateFoodBall = async () => {
        const row = Math.floor(Math.random() * ROWs);
        const col = Math.floor(Math.random() * COLs);

        foodCoords.current = {row, col};
    };

    const startGame = async () => {
        initGame();
        const interval = setInterval(() => moveSnek(), TICK_SPEED_MS);
        timer.current = interval;
    };

    const stopGame = async () => {
        setGameOver(true);
        setPlaying(false);
        setInvert(false);
        if (timer.current) {
            clearInterval(timer.current);
        }
    };

    const getCell = useCallback(
        (row_idx, col_idx) => {
            const coords = `${row_idx}:${col_idx}`;
            const foodPos = `${foodCoords.current.row}:${foodCoords.current.col}`;
            const head =
                snekCoordinates.current[snekCoordinates.current.length - 1];
            const headPos = `${head?.row}:${head?.col}`;

            const isFood = coords === foodPos;
            const isSnekBody = snekCoordinatesMap.current.has(coords);
            const isHead = headPos === coords;

            let className = "cell";
            if (isFood) {
                className += " food";
            }
            if (isSnekBody) {
                className += " body";
            }
            if (isHead) {
                className += " head";
            }

            return <div key={col_idx} className={className}></div>;
        }, []
    );

    return (
        <div 
            className={`game-container${invert ? ' invert' : ''}`}
        >
            <h1
                style={{display: isPlaying || gameOver ? 'none' : 'block'}}
            >
                SNEK
            </h1>
            {gameOver && <p className="game-over">GAME OVER</p>}
            {!isPlaying && !gameOver && <button onClick={startGame}>start game</button>}
            {gameOver && <button onClick={startGame}>main menu</button>}
            <div 
                className="board"
                style={{
                    display: isPlaying || gameOver? 'block' : 'none',
                }}
            >
                {grid.current?.map((row, row_idx) => (
                    <div key={row_idx} className="row">
                        {row.map((_, col_idx) => getCell(row_idx, col_idx))}
                    </div>
                ))}
            </div>
            <p
                style={{
                    display: isPlaying || gameOver ? 'block' : 'none',
                    color: invert ? 'white' : 'black'
                }}
                className="score"
            >
                food eaten: {points}
            </p>
        </div>
    );
}
