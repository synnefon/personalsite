import React, { useEffect, useRef, useState } from "react";

import "../styles/game4096.css";
import { randomChoice, shuffle } from "../util/Random";

const DIM = 4;

const COLOR_MAP = {
  0: "grey",
  2: "#D6B300",
  4: "#AC8F10",
  8: "#826B20",
  16: "#58482F",
  32: "#2E243F", 
  64: "#04004F",
  128: "#020024",
  256: "#000000",
  512: "#062B1A",
  1024: "#062B1A",
  2048: "#0D5635",
  4096: "#13804F"
}

const LEFT = "ArrowLeft";
const RIGHT = "ArrowRight";
const UP = "ArrowUp";
const DOWN = "ArrowDown";

const initCells = (): Array<Array<number>> => {
  const choices = Array.from({ length: DIM }, (_, idx) => idx);
  let c1 = {x: randomChoice(choices), y: randomChoice(choices)};
  let c2 = {x: randomChoice(choices), y: randomChoice(choices)};
  while (c1.x === c2.x && c1.y === c2.y) {
    c2 = {x: randomChoice(choices), y: randomChoice(choices)};
  }

  const cells = Array.from({ length: DIM }, () => new Array(DIM).fill(0));
  cells[c1.y][c1.x] = 2;
  cells[c2.y][c2.x] = 2;

  return cells;
}

const DrawableCell = ({value}) => {
  const style = {
    backgroundColor: COLOR_MAP[value] || "black",
  }
  return (
    <div className="cell-4096" style={style}>
      {value === 0 ? "" : value}
    </div>
  );
}

export default function Game4096() {
  const cells = useRef(initCells());
  const processing = useRef(false);
  const [score, setScore] = useState(0);

  const spawnBaby = () => {
    const empties: Array<{x: number, y: number}> = [];
    for (let y=0; y<DIM; y++) {
      for (let x=0; x<DIM; x++) {
        if (cells.current[y][x] === 0) {
          empties.push({x: x, y: y});
        }
      }
    }
    if (empties.length === 0) return;

    const selected = shuffle(empties)[0];
    cells.current[selected.y][selected.x] = 2;
  }

  const clenchStrip = (strip: Array<number>): Array<number> => {
    strip.reverse();
    let found = 0;
    for (let i=0; i<strip.length-1; i++) {
      if (strip[i+found] && strip[i] === strip[i+1]) {
        found += 1;
        strip[i] += strip[i];
      } else if (found > 0) {
        strip[i] = strip[i+found] || 0;
      }
    }
    if (found) {
      strip.pop();
      strip = [...Array.from({ length: found }, () => 0), ...strip];
    }
    return strip;
  }

  const shiftY = (dir: string) => {
    let yd = dir === DOWN ? -1 : 1;
    let start = dir === DOWN ? DIM-1 : 0;
    let end = dir === DOWN ? -1 : DIM;

    const newCells = Array.from({ length: DIM }, () => new Array(DIM).fill(0));

    for (let x = 0; x < DIM; x++) {
      let col: Array<number> = [];
      for (let y = start; y !== end; y+=yd) {
        const val = cells.current[y][x];
        if (val !== 0) col.push(val);
      }
      col = clenchStrip(col);
      for (let y = start; y !== end; y+=yd) {
        newCells[y][x] = col.pop() || 0;
      }
    }

    cells.current = newCells;
    spawnBaby();
    setScore(s => s+1);
  };

  const shiftX = (dir: string) => {
    let xd = dir === RIGHT ? -1 : 1;
    let start = dir === RIGHT ? DIM-1 : 0;
    let end = dir === RIGHT ? -1 : DIM;

    const newCells = Array.from({ length: DIM }, () => new Array(DIM).fill(0));

    for (let y = 0; y < DIM; y++) {
      let col: Array<number> = [];
      for (let x = start; x !== end; x+=xd) {
        const val = cells.current[y][x];
        if (val !== 0) col.push(val);
      }
      col = clenchStrip(col);
      for (let x = start; x !== end; x+=xd) {
        newCells[y][x] = col.pop() || 0;
      }
    }

    cells.current = newCells;
    spawnBaby();
    setScore(s => s+1);
  };

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (processing.current) return;
      processing.current = true;
      switch (e.key) {
        case LEFT: 
        case RIGHT: shiftX (e.key); break;
        case UP:
        case DOWN: shiftY(e.key);
      }
      processing.current = false;
    };

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  return (
    <div id="game-4096">
      {score}
      <div className="board-4096">
        {cells.current.flatMap((row: Array<number>, ridx: number) => {
          return row.map((c: number, cidx: number) => {
            return <DrawableCell key={`${ridx}-${cidx}`} value={c}/>
          });
        })}
      </div>
    </div>
  );
}