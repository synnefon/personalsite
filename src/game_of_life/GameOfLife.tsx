import React, { useCallback, useRef, useState } from "react";
import { ReactElement } from "react";

import '../styles/gameoflife.css'

const SIDE_LEN = 40;
const TICK_DELTA = 250;

const initBoard = (): Array<Array<boolean>> => {
  const vals: Array<Array<boolean>> = new Array(SIDE_LEN);

  for (let ridx=0; ridx<SIDE_LEN; ridx++) {
    const row: Array<boolean> = new Array(SIDE_LEN);
    for (let cidx=0; cidx<SIDE_LEN; cidx++) {
      row[cidx] = false;
    }
    vals[ridx] = row;
  }
  return vals;
}

export default function GameOfLife(): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, forceRefresh] = useState(true);

  const tickGame = useRef(false);
  const board = useRef(initBoard());

  const Cell = ({ridx, cidx}): ReactElement => {
    const [isFilled, setIsFilled] = useState<boolean>(board.current[ridx][cidx]);
    return (
      <div 
        className={`gol-board-cell${isFilled ? ' filled' : ''}`}
        onClick={() => {
          board.current[ridx][cidx] = !board.current[ridx][cidx];
          setIsFilled((ic: boolean) =>!ic);
        }}
      />
    );
  }

  const getFilledNeighborCount = (ridx: number, cidx: number): number => {
    let numFilledNeighbors = 0;
    for (let r=Math.max(0, ridx-1); r<=Math.min(SIDE_LEN-1, ridx+1); r++) {
      for (let c=Math.max(0, cidx-1); c<=Math.min(SIDE_LEN-1, cidx+1); c++) { 
        if (board.current[r][c] && (r!==ridx || c !== cidx)) {
          numFilledNeighbors++;
        }
      }
    }
    return numFilledNeighbors;
  }

  const shouldBeFilled = useCallback((ridx: number, cidx: number): boolean => {
    // Any live cell with fewer than two live neighbours dies, as if by underpopulation.
    // Any live cell with two or three live neighbours lives on to the next generation.
    // Any live cell with more than three live neighbours dies, as if by overpopulation.
    // Any dead cell with exactly three live neighbours becomes a live cell, as if by reproduction.
    const numFilledNeighbors: number = getFilledNeighborCount(ridx, cidx);
    return (board.current[ridx][cidx] && numFilledNeighbors === 2) || numFilledNeighbors === 3;
  }, []);

  const runTick = useCallback((): void => {
    if (!tickGame.current) return;

    const newBoard: Array<Array<boolean>> = new Array(SIDE_LEN);
    for (let ridx=0; ridx<SIDE_LEN; ridx++) {
      const rowVals: Array<boolean> = new Array(SIDE_LEN);
      for (let cidx=0; cidx<SIDE_LEN; cidx++) {
        rowVals[cidx] = shouldBeFilled(ridx, cidx);
      }
      newBoard[ridx] = rowVals;
    }

    board.current = newBoard;
    forceRefresh((f) => !f);
    setTimeout(() => runTick(), TICK_DELTA);
  }, [shouldBeFilled]);

  const onToggleStart = (): void => {
    tickGame.current = !tickGame.current;
    if (tickGame.current) {
      runTick();
    } else {
      forceRefresh((f) => !f)
    }
  }

  return (
    <div id='game-of-life'>
      <div className="gol-board">
        {board.current.map((row: Array<boolean>, ridx: number) => {
          const cells = row.map((_, cidx: number) => {
            return <Cell key={`cell-${cidx}`} ridx={ridx} cidx={cidx}/>;
          })
          return <div key={`row-${ridx}`} className="gol-board-row">{cells}</div>;
        })}
      </div>
      <div
        className="gol-start-button"
        onClick={onToggleStart}
      >
        {tickGame.current ? "pause" : "start"}
      </div>
    </div>
  );
}