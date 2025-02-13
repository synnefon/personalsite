import { makeSudoku } from './SudokuUtils';

import '../styles/sudoku.css'
import { useMemo, useRef, useState } from 'react';

export default function Sudoku() {
  const makeColorBoard = (board) => {
    return board.map((row, ridx) => {
      return row.map((c, cidx) => {
        return ({ ridx, cidx, value: c, color: null, notes: [], ignorable: false })
      })
    })
  }
  const sudoku = useMemo(() => makeSudoku(), []);
  const board = useRef(makeColorBoard(sudoku.board));
  const solvedBoard = useRef(makeColorBoard(sudoku.solvedBoard));
  const history = useRef([]);

  const ALL_NUMS = Array.from({ length: 9 }, (_, i) => String(i + 1));

  const [selectedVal, setSelectedVal] = useState(null);
  const [takingNotes, setTakingNotes] = useState(false);
  const [highlightVal, setHighlightVal] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const [_, setRefresh] = useState(0);
  const forceRefresh = () => setRefresh((u) => !u);

  const noteSubCell = (cell, n) => {
    const key = `${cell.ridx}-${cell.cidx}-${n}`;
    const shouldHighlightText = n === (highlightVal ? highlightVal : selectedVal);
    return <div key={key} className={`note-sub-cell ${shouldHighlightText && "text-highlight"}`}>
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
                const shouldHighlightText = cell.color !== "incorrect"
                  && cell.value === (highlightVal ? highlightVal : selectedVal);
                const color = `
                  ${cell.color ? cell.color : "inherit"}
                  ${cell.highlightColor ? " " + cell.highlightColor : ""}
                  ${shouldHighlightText ? " text-highlight" : ""}
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
    if (selectedVal === null || selectedVal !== n) {
      setSelectedVal(n);
    } else {
      setSelectedVal(null);
    }
  }

  const onUndo = () => {
    if (history.current.length === 0) return;

    clearHighlights();

    let cell = history.current.pop();
    board.current[cell.ridx][cell.cidx] = cell;

    while (history.current.length > 0) {
      cell = history.current.pop();
      if (cell.ignorable) {
        board.current[cell.ridx][cell.cidx] = cell;
      } else {
        history.current.push(cell);
        break;
      }
    }

    forceRefresh();
  }

  const setCell = ({ update, ridx, cidx, refresh = true, record = false }) => {
    const newBoard = board.current;
    const cell = newBoard[ridx][cidx];

    if (record) {
      history.current.push({ ...cell, ignorable: update.ignorable });
    }

    newBoard[ridx][cidx] = { ...cell, ...update, ignorable: false };
    board.current = newBoard;

    if (refresh) forceRefresh();
  }

  const takeNote = (ridx, cidx) => {
    const update = {};
    if (board.current[ridx][cidx].notes.includes(selectedVal)) {
      update.notes = board.current[ridx][cidx].notes.filter(n => n !== selectedVal);
    } else {
      update.notes = board.current[ridx][cidx].notes.concat([selectedVal]);
    }
    setCell({ update, ridx, cidx, record: true });
  }

  // does NOT refresh
  const updateNeighbors = (update, ridx, cidx, record = false) => {
    const cellsToUpdate = new Set();
    for (let i = 0; i < 9; i++) {
      // sub grid
      const gridRow = (Math.floor(ridx / 3) * 3) + Math.floor(i / 3);
      const gridCol = (Math.floor(cidx / 3) * 3) + (i % 3);
      if (ridx !== gridRow && cidx !== gridCol) {
        cellsToUpdate.add({ ridx: gridRow, cidx: gridCol });
      }
      // row and col
      if (i !== cidx) cellsToUpdate.add({ ridx, cidx: i });
      if (i !== ridx) cellsToUpdate.add({ ridx: i, cidx });
    }

    for (let { ridx, cidx } of cellsToUpdate) {
      setCell({ update, ridx, cidx, record, refresh: false });
    }
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
      setHighlightVal(board.current[ridx][cidx].value);
      setCell({ update: { highlightColor: 'epicenter' }, ridx, cidx, refresh: false });
      update.highlightColor = 'highlight';
    }

    updateNeighbors(update, ridx, cidx);

    forceRefresh();
  }

  const onBoardClick = (ridx, cidx) => {
    if (board.current[ridx][cidx].value === solvedBoard.current[ridx][cidx].value) {
      highlightStuff(ridx, cidx);
      return;
    }

    clearHighlights();

    if (selectedVal === null) {
      forceRefresh();
      return;
    }
    if (takingNotes) return takeNote(ridx, cidx);

    const update = {};
    if (selectedVal !== board.current[ridx][cidx].value) {
      const isCorrect = solvedBoard.current[ridx][cidx].value === selectedVal;
      update.value = selectedVal;
      update.color = isCorrect ? 'new-text' : 'incorrect';
      update.notes = [];

      if (isCorrect) {
        const neighborUpdate = {
          notes: board.current[ridx][cidx].notes.filter(n => n !== selectedVal),
          ignorable: true
        };
        updateNeighbors(neighborUpdate, ridx, cidx, true);
      } else {
        setMistakes(m => m + 1);
      }
    } else if ("." !== board.current[ridx][cidx].value) {
      update.color = null;
      update.value = ".";
    }
    setCell({ update, ridx, cidx, record: true });
  }

  return (
    <div id='app-base' className={`sudoku-colors`}>
      <div className='sudoku-container'>
        <div>mistakes: {mistakes}</div>
        {displayableBoard(board.current)}
        <div className='sudoku-selector-panel'>
          {ALL_NUMS.map((n) =>
            <div
              key={`selector-${n}`}
              className={`sudoku-selection${selectedVal === n ? ' selected' : ''}`}
              onClick={() => onSelectorClick(n)}
            >
              {n}
            </div>
          )}
        </div>
        <div className='sudoku-control-panel'>
          <div className={`sudoku-control-pane left`} onClick={onUndo}>
            <div className='sudoku-control-content'>
              <p className='control big'>⟲</p>
              <p className='control'>undo</p>
            </div>
          </div>
          <div
            className={`sudoku-control-pane right${takingNotes ? ' selected' : ''}`}
            onClick={() => setTakingNotes(b => !b)}
          >
            <div className='sudoku-control-content'>
              <p className='control big'>✎</p>
              <p className='control'>notes</p>
            </div>
            {/* <div className='sudoku-control-content'>notes</div> */}
          </div>
        </div>
      </div>
    </div>
  );
}
