import { makeSudoku } from './SudokuUtils';

import '../styles/sudoku.css'
import { useMemo, useRef, useState } from 'react';

export default function Sudoku() {
  const makeColorBoard = (board) => {
    return board.map((row, ridx) => {
      return row.map((c, cidx) => {
        return ({ ridx, cidx, value: c, color: 'inherit', notes: [] })
      })
    })
  }
  const sudoku = useMemo(() => makeSudoku(), []);
  const board = useRef(makeColorBoard(sudoku.board));
  const solvedBoard = useRef(makeColorBoard(sudoku.solvedBoard));

  const ALL_NUMS = Array.from({ length: 9 }, (_, i) => String(i + 1));

  const [availableNumbers, setAvailableNumbers] = useState(ALL_NUMS);
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [history, setHistory] = useState([]);
  const [takingNotes, setTakingNotes] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [_, setUpdateForcer] = useState(0);
  const forceUpdate = () => setUpdateForcer((u) => !u);

  const noteSubCell = (cell, n) => {
    const key = `${cell.ridx}-${cell.cidx}-${n}`;
    return <div key={key} className='note-sub-cell'>
      {cell.notes.includes(n) ? n : <></>}
    </div>;
  }
  const displayableCell = (cell) => {
    if (cell.value !== ".") return cell.value;
    return <div className='note-cell'>
      <div className='note-row'>{["1", "2", "3"].map(n => noteSubCell(cell, n))}</div>
      <div className='note-row'>{["4", "5", "6"].map(n => noteSubCell(cell, n))}</div>
      <div className='note-row'>{["7", "8", "9"].map(n => noteSubCell(cell, n))}</div>
    </div>;
  }

  const displayableBoard = (board) => {
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
                  {displayableCell(cell)}
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

  const onUndo = () => {
    if (history.length === 0) return;
    const cell = history.pop();
    setHistory(history);
    board.current[cell.ridx][cell.cidx] = cell;
    forceUpdate();
  }

  const setCell = (newVals, ridx, cidx) => {
    history.push(board.current[ridx][cidx]);
    setHistory(history);

    const newBoard = board.current;
    const cell = newBoard[ridx][cidx];
    newBoard[ridx][cidx] = { ...cell, ...newVals };
    board.current = newBoard;
    forceUpdate();
  }

  const takeNote = (ridx, cidx) => {
    const update = {};
    if (board.current[ridx][cidx].notes.includes(selectedNumber)) {
      update.notes = board.current[ridx][cidx].notes.filter(n => n !== selectedNumber);
    } else {
      update.notes = board.current[ridx][cidx].notes.concat([selectedNumber]);
    }
    setCell(update, ridx, cidx);
  }

  const onBoardClick = (ridx, cidx) => {
    if (selectedNumber === null) return;
    if (board.current[ridx][cidx].value === solvedBoard.current[ridx][cidx].value) {
      return;
    }
    if (takingNotes) return takeNote(ridx, cidx);

    const update = {};
    if (selectedNumber === board.current[ridx][cidx].value) {
      update.color = "inherit";
      update.value = ".";
    } else {
      update.value = selectedNumber;
      update.color = solvedBoard.current[ridx][cidx].value === selectedNumber ? 'green' : 'red';
      update.notes = [];
    }
    setCell(update, ridx, cidx);
  }

  return (
    <div id='app-base' className={`sudoku-colors`}>
      <div className='sudoku-container'>
        {displayableBoard(board.current)}
        <div className='sudoku-selector-panel'>
          {availableNumbers.map((n) =>
            <div
              key={`selector-${n}`}
              className={`sudoku-selection${selectedNumber === n ? ' selected' : ''}`}
              onClick={() => onSelectorClick(n)}
            >
              {n}
            </div>
          )}
        </div>
        <div className='sudoku-control-panel'>
          <div className={`sudoku-control-pane left`} onClick={onUndo}>
            <div style={{ fontSize: "min(5vw, 6vh)" }}>⟲</div>
            <div>undo</div>
          </div>
          <div
            className={`sudoku-control-pane right${takingNotes ? ' selected' : ''}`}
            onClick={() => setTakingNotes(b => !b)}
          >
            <div style={{ fontSize: "min(5vw, 6vh)" }}>✎</div>
            <div>notes</div>
          </div>
        </div>
      </div>
    </div>
  );
}
