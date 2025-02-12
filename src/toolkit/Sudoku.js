import { makeSudoku } from './SudokuUtils';

import '../styles/sudoku.css'
import { useMemo, useRef, useState } from 'react';

export default function Sudoku() {
  const makeColorBoard = (board) => {
    return board.map((row) => {
      return row.map((c) => ({value: c, color: 'inherit'}))
    })
  }
  const sudoku = useMemo(() => makeSudoku(), []);
  const unsolvedBoard = useRef(makeColorBoard(sudoku.unsolvedBoard));
  const solvedBoard = useRef(makeColorBoard(sudoku.solvedBoard));
  
  const [availableNumbers, setAvailableNumbers] = useState(
    Array.from({ length: 9 }, (_, i) => (i + 1))
  );
  const [selectedNumber, setSelectedNumber] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [_, setUpdateForcer] = useState(0);
  const forceUpdate = () => setUpdateForcer((u) => !u);

  const onBoardClick = (ridx, cidx) => {
    if (selectedNumber === null) return;
    if (unsolvedBoard.current[ridx][cidx].value === solvedBoard.current[ridx][cidx].value) {
      return;
    }

    const correctNumber = solvedBoard.current[ridx][cidx].value;
    const newBoard = unsolvedBoard.current;
    console.log(correctNumber, selectedNumber)
    newBoard[ridx][cidx] = {
      value: selectedNumber,
      color: String(correctNumber) === String(selectedNumber) ? 'green' : 'red'
    };
    unsolvedBoard.current = newBoard;

    forceUpdate();
  }

  const writableBoard = (board) => {
    return (
      <div className='sudoku-board'>
        {board.map((row, ridx) => {
          return (
            <div key={ridx} className='sudoku-row'>
              {row.map((cell, cidx) => 
                <div
                  key={`${ridx}-${cidx}`}
                  className={`sudoku-cell ${cell.color} r${ridx} c${cidx}`}
                  onClick={() => onBoardClick(ridx, cidx)}
                >
                  {cell.value === '.' ? " " : cell.value}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const onSelectorClick = (n) => {
    if (selectedNumber === null || selectedNumber !== n) {
      setSelectedNumber(n);
    } else {
      setSelectedNumber(null);
    }
  }

  return (
    <div id='app-base' className={`sudoku-colors`}>
      <div className='sudoku-container'>
        {writableBoard(unsolvedBoard.current)}
        {/* {writableBoard(solvedBoard)} */}
        <div className='number-selector'>
          {availableNumbers.map((n) => 
            <div 
              key={`selector-${n}`}
              className={`sudoku-cell selector${selectedNumber === n ? ' selected' : ''}`}
              onClick={() => onSelectorClick(n)}
            >
              {n}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
