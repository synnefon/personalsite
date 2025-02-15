import { useEffect, useMemo, useRef, useState } from 'react';
import { signInUser, writeBoard, getBoard } from "../util/Database";

import { makeSudoku, encryptBoardState, decryptBoardState } from './SudokuUtils';

import '../styles/sudoku.css'

const makeColorBoard = (board) => {
  return board.map((row, ridx) => {
    return row.map((c, cidx) => {
      return ({ ridx, cidx, val: c, color: null, notes: [], ignorable: false })
    })
  })
};

const countInstances = (board, n) => {
  let count = 0;
  for (let row of board) {
    for (let cell of row) {
      if (cell.val === n && cell.color !== "incorrect") count++;
    }
  }
  return count;
};

export default function Sudoku() {
  const ALL_NUMS = Array.from({ length: 9 }, (_, i) => String(i + 1));

  const sudoku = useMemo(() => makeSudoku(), []);
  const board = useRef(makeColorBoard(sudoku.board));
  const solvedBoard = useRef(makeColorBoard(sudoku.solvedBoard));
  const history = useRef([]);
  const startTime = useRef(Date.now());
  const valsLeft = useRef(ALL_NUMS);

  const [selectedVal, setSelectedVal] = useState(null);
  const [takingNotes, setTakingNotes] = useState(false);
  const [highlightCell, setHighlightCell] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  const [timerMillis, setTimerMillis] = useState(0);
  const [runTimer, setRunTimer] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const togglePopup = (b) => {
    setShowPopup(b);
    toggleTime(b);
  }
  // eslint-disable-next-line no-unused-vars
  const [_, setRefresh] = useState(0);
  const forceRefresh = () => setRefresh((u) => !u);

  const cellsEq = (c1, c2) => {
    return c1?.val === c2?.val && c1?.ridx === c2?.ridx && c1?.cidx === c2?.cidx;
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
  const updateNeighbors = (makeUpdate, r, c, record = false) => {
    const cellsToUpdate = new Set();
    for (let i = 0; i < 9; i++) {
      // sub grid
      const gridRow = (Math.floor(r / 3) * 3) + Math.floor(i / 3);
      const gridCol = (Math.floor(c / 3) * 3) + (i % 3);
      if (r !== gridRow && c !== gridCol) {
        cellsToUpdate.add({ ridx: gridRow, cidx: gridCol });
      }
      // row and col
      if (i !== c) cellsToUpdate.add({ ridx: r, cidx: i });
      if (i !== r) cellsToUpdate.add({ ridx: i, cidx: c });
    }

    for (let { ridx, cidx } of cellsToUpdate) {
      setCell({ update: makeUpdate(ridx, cidx), ridx, cidx, record, refresh: false });
    }
  }

  // does NOT refresh
  const clearHighlights = () => {
    setHighlightCell(null);
    const update = { highlightColor: null, textHighlight: null };
    for (let ridx = 0; ridx < 9; ridx++) {
      for (let cidx = 0; cidx < 9; cidx++) {
        setCell({ update, ridx, cidx, refresh: false });
      }
    }
  }

  const highlightStuff = (ridx, cidx) => {
    const update = {};
    const isHighlighted = cellsEq(board.current[ridx][cidx], highlightCell);

    if (isHighlighted) {
      setCell({ update: { highlightColor: null }, ridx, cidx, refresh: false });
      update.highlightColor = null;
    } else {
      setHighlightCell(board.current[ridx][cidx]);
      setCell({ update: { highlightColor: 'epicenter' }, ridx, cidx, refresh: false });
      update.highlightColor = 'highlight';
    }

    updateNeighbors(() => update, ridx, cidx);
    forceRefresh();
  }

  const updateCell = (ridx, cidx) => {
    if (selectedVal === board.current[ridx][cidx].val) {
      setCell({ update: { color: null, val: "." }, ridx, cidx, record: true });
      return;
    };

    const isCorrect = solvedBoard.current[ridx][cidx].val === selectedVal;
    if (isCorrect) {
      const filterNotes = (notes) => notes.filter(n => n !== selectedVal);
      const makeUpdate = (r, c) => ({ notes: filterNotes(board.current[r][c].notes), ignorable: true });

      updateNeighbors(makeUpdate, ridx, cidx, true);
    } else {
      setMistakes(m => m + 1);
    }

    const update = {val: selectedVal, color:  isCorrect ? 'new-text' : 'incorrect', notes: []};
    setCell({ update, ridx, cidx, record: true });
  }

  const onBoardClick = (ridx, cidx) => {
    clearHighlights();

    if (board.current[ridx][cidx].val === solvedBoard.current[ridx][cidx].val) {
      highlightStuff(ridx, cidx);
    } else if (selectedVal === null) {
      forceRefresh();
    } else if (takingNotes) {
      takeNote(ridx, cidx);
    } else {
      updateCell(ridx, cidx);
    }
  }

  const toggleTime = (b) => {
    if (b) {
      setRunTimer(false);
    } else {
      startTime.current = Date.now() - timerMillis;
      setRunTimer(true);
    }
  }

  const saveBoard = async () => {
    await signInUser().then(async (uid) => {
      const boardString = encryptBoardState(board.current, solvedBoard.current, timerMillis, mistakes);
      await writeBoard(uid, boardString);
    });
  }

  const loadBoard = async () => {
    await signInUser().then(async (uid) => {
      await getBoard(uid).then(b => {
        const { savedBoard, savedSolvedBoard, savedTime, savedMistakes } = decryptBoardState(b);
        if (!savedBoard) return;
        
        board.current = savedBoard;
        solvedBoard.current = savedSolvedBoard;
        startTime.current = Date.now() - savedTime;
        setTimerMillis(Date.now() - startTime.current);
        setMistakes(savedMistakes);
        forceRefresh();
      });
    });
  }

  useEffect(() => {
    const delta = 1_000;
    const timeout = setTimeout(() => {
      if (runTimer) setTimerMillis(Date.now() - startTime.current);
    }, delta);

    return () => clearTimeout(timeout);
  }, [timerMillis, runTimer]);

  const noteSubCell = (cell, n) => {
    const key = `${cell.ridx}-${cell.cidx}-${n}`;
    const shouldHighlightText = n === (highlightCell?.val ? highlightCell.val : selectedVal);
    return <div key={key} className={`note-sub-cell ${shouldHighlightText && "text-highlight"}`}>
      {cell.notes.includes(n) ? n : <></>}
    </div>;
  };

  const displayableCell = (cell) => {
    if (cell.val !== ".") return cell.val;
    return <div className='note-cell'>
      <div className='note-row'>{["1", "2", "3"].map(n => noteSubCell(cell, n))}</div>
      <div className='note-row'>{["4", "5", "6"].map(n => noteSubCell(cell, n))}</div>
      <div className='note-row'>{["7", "8", "9"].map(n => noteSubCell(cell, n))}</div>
    </div>;
  };

  const displayableBoard = (board) => {
    return (
      <div className='sudoku-board'>
        {board.map((row, ridx) => {
          return (
            <div key={ridx} className='sudoku-row'>
              {row.map((cell, cidx) => {
                const shouldHighlightText = 
                  cell.color !== "incorrect"
                  && cell.val === (highlightCell?.val ? highlightCell.val : selectedVal);
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
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const Popup = () => {
    const loadAndClose = () => {
      loadBoard();
      togglePopup(false);
    };
    return (
      <>
        {showPopup && <div className='confirmation-popup'>
          load previously saved data into board? 
          <div className='choice-button-row'>
            <button onClick={() => togglePopup(false)} className='choice-button'>N</button>
            <button onClick={loadAndClose} className='choice-button'>Y</button>
          </div>
        </div>}
      </>
    );
  }

  return (
    <div id='app-base' className={`sudoku-colors`}>
      <Popup/>
      <div className='sudoku-container'>
        <div className='save-load'>
          <button className="save-load-button" onClick={() => togglePopup(true)}>load game</button>
          <div className='mistakes'>mistakes: {mistakes}</div>
          <button className="save-load-button" onClick={saveBoard}>save game</button>
        </div>
        {displayableBoard(board.current)}
        <div className='sudoku-selector-panel'>
          {valsLeft.current.map(n => {
            return countInstances(board.current, n) === 9 
            ? <div key={`selector-empty-${n}`} className="sudoku-selection empty"/> 
            : <div
              key={`selector-${n}`}
              className={`sudoku-selection${selectedVal === n ? ' selected' : ''}`}
              onClick={() => onSelectorClick(n)}
            >
              {n}
            </div>
          })}
        </div>
        <div className='sudoku-control-panel'>
          <div className={`sudoku-control-pane undo`} onClick={onUndo}>
            <img alt="undo icon" className='control img undo' />
            <p className='control undo'>undo</p>
          </div>
          <div className={`sudoku-control-pane timer`} onClick={() => toggleTime(runTimer)}>
            <img alt="timer icon" className='control timer' />
            <p className={`control timer${runTimer ? "" : " selected"}`}>
              {Math.floor(timerMillis / 1_000)}
            </p>
          </div>
          <div
            className={`sudoku-control-pane pencil${takingNotes ? " selected" : ""}`}
            onClick={() => setTakingNotes(b => !b)}
          >
            <img alt="pencil icon" className="control pencil" />
            <p className='control pencil'>notes</p>
          </div>
        </div>
      </div>
    </div>
  );
}
