import { makeSudoku } from './SudokuUtils';

import '../styles/sudoku.css'
import { useMemo, useRef, useState } from 'react';

export default function Sudoku() {
  const makeColorBoard = (board) => {
    return board.map((row, ridx) => {
      return row.map((c, cidx) => {
        return ({ ridx, cidx, value: c, color: null, notes: [] })
      })
    })
  }
  const sudoku = useMemo(() => makeSudoku(), []);
  const board = useRef(makeColorBoard(sudoku.board));
  const solvedBoard = useRef(makeColorBoard(sudoku.solvedBoard));

  const ALL_NUMS = Array.from({ length: 9 }, (_, i) => String(i + 1));

  const [selectedNumber, setSelectedNumber] = useState(null);
  const [history, setHistory] = useState([]);
  const [takingNotes, setTakingNotes] = useState(false);
  const [highlightVal, setHighlightVal] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [_, setRefresh] = useState(0);
  const forceRefresh = () => setRefresh((u) => !u);

  const noteSubCell = (cell, n) => {
    const key = `${cell.ridx}-${cell.cidx}-${n}`;
    return <div key={key} className={`note-sub-cell ${highlightVal === n && "text-highlight"}`}>
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
              {row.map((cell, cidx) => {
                const color = `
                  ${cell.color ? cell.color : "inherit"}
                  ${cell.highlightColor ? " " + cell.highlightColor : ""}
                  ${cell.value === highlightVal && cell.color !== "red" ? " text-highlight" : ""}
                `;
                return <div
                  key={`${ridx}-${cidx}`}
                  className={`sudoku-cell ${color} r${ridx} c${cidx}`}
                  onClick={() => onBoardClick(ridx, cidx)}
                >
                  {displayableCell(cell)}
                </div>
              }

              )}
            </div>
          );
        })}
      </div>
    );
  }

  const onSelectorClick = (n) => {
    if (selectedNumber === null || selectedNumber !== n) {
      setHighlightVal(n);
      setSelectedNumber(n);
    } else {
      setHighlightVal(null);
      setSelectedNumber(null);
    }
  }

  const onUndo = () => {
    if (history.length === 0) return;
    clearHighlights();
    const cell = history.pop();
    setHistory(history);
    board.current[cell.ridx][cell.cidx] = cell;
    forceRefresh();
  }

  const setCell = ({ update, ridx, cidx, refresh = true, record = false }) => {
    if (record) {
      history.push(board.current[ridx][cidx]);
      setHistory(history);
    }

    const newBoard = board.current;
    const cell = newBoard[ridx][cidx];
    newBoard[ridx][cidx] = { ...cell, ...update };
    board.current = newBoard;

    if (refresh) forceRefresh();
  }

  const takeNote = (ridx, cidx) => {
    const update = {};
    if (board.current[ridx][cidx].notes.includes(selectedNumber)) {
      update.notes = board.current[ridx][cidx].notes.filter(n => n !== selectedNumber);
    } else {
      update.notes = board.current[ridx][cidx].notes.concat([selectedNumber]);
    }
    setCell({ update, ridx, cidx, record: true });
  }

  // does NOT refresh
  const clearHighlights = () => {
    setHighlightVal(null);

    const update = { highlightColor: null, textHighlight: null };
    for (let ridx = 0; ridx < 9; ridx++) {
      for (let cidx = 0; cidx < 9; cidx++) {
        setCell({ update, ridx, cidx, refresh: false });
      }
    }
  }

  const highlightStuff = (ridx, cidx) => {
    const update = {};
    const isHighlighted = board.current[ridx][cidx].highlightColor === 'epicenter';

    clearHighlights();

    if (isHighlighted) {
      setCell({ update: { highlightColor: null }, ridx, cidx, refresh: false });
      update.highlightColor = null;
    } else {
      setCell({ update: { highlightColor: 'epicenter' }, ridx, cidx, refresh: false });
      update.highlightColor = 'highlight';
    }

    for (let i = 0; i < 9; i++) {
      if (i !== cidx) setCell({ update, ridx, cidx: i, refresh: false });
      if (i !== ridx) setCell({ update, ridx: i, cidx, refresh: false });
    }
    forceRefresh();
  }

  const onBoardClick = (ridx, cidx) => {
    if (board.current[ridx][cidx].value === solvedBoard.current[ridx][cidx].value) {
      highlightStuff(ridx, cidx);
      return;
    }

    clearHighlights();

    if (selectedNumber === null) {
      forceRefresh();
      return;
    }
    if (takingNotes) return takeNote(ridx, cidx);

    const update = {};
    if (selectedNumber !== board.current[ridx][cidx].value) {
      update.value = selectedNumber;
      update.color = solvedBoard.current[ridx][cidx].value === selectedNumber ? 'green' : 'red';
      update.notes = [];
    } else if ("." !== board.current[ridx][cidx].value) {
      update.color = null;
      update.value = ".";
    }
    setCell({ update, ridx, cidx, record: true });
  }

  return (
    <div id='app-base' className={`sudoku-colors`}>
      <div className='sudoku-container'>
        {displayableBoard(board.current)}
        <div className='sudoku-selector-panel'>
          {ALL_NUMS.map((n) =>
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
