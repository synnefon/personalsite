import { useEffect, useMemo, useRef, useState } from 'react';
import { signInUser, writeBoard, getBoard } from "../util/Database";

import { makeSudoku, encryptBoardState, decryptBoardState } from './SudokuUtils';
import DisplayableBoard from './DisplayableBoard';
import SelectorPanel from './SelectorPanel';
import ControlPanel from './ControlPanel';
import WinScreen from './WinScreen';
import TopBar from './TopBar';

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
  const ALL_NUMS = useMemo(() => Array.from({ length: 9 }, (_, i) => String(i + 1)), []);

  const sudoku = useMemo(() => makeSudoku(), []);
  const board = useRef(makeColorBoard(sudoku.board));
  const solvedBoard = useRef(makeColorBoard(sudoku.solvedBoard));
  const history = useRef([]);
  const startTime = useRef(Date.now());

  const [selectedVal, setSelectedVal] = useState(null);
  const [takingNotes, setTakingNotes] = useState(false);
  const [highlightCell, setHighlightCell] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  const [timerMillis, setTimerMillis] = useState(0);
  const [runTimer, setRunTimer] = useState(true);
  const [notesTaken, setNotesTaken] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const [_, setRefresh] = useState(0);
  const forceRefresh = () => setRefresh((u) => !u);

  const cellsEq = (c1, c2) => {
    return c1?.val === c2?.val && c1?.ridx === c2?.ridx && c1?.cidx === c2?.cidx;
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
      setNotesTaken(nt => nt+1);
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

    const update = {val: selectedVal, color:  isCorrect ? 'new-text' : 'incorrect'};
    setCell({ update, ridx, cidx, record: true });
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

  const onSelectorClick = (n) => {
    clearHighlights();
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
      const boardString = encryptBoardState(board.current, solvedBoard.current, timerMillis, mistakes, notesTaken);
      await writeBoard(uid, boardString);
    });
  }

  const loadBoard = async () => {
    await signInUser().then(async (uid) => {
      await getBoard(uid).then(b => {
        const { savedBoard, savedSolvedBoard, savedTime, savedMistakes, savedNotesTaken } = decryptBoardState(b);
        if (!savedBoard) return;
        
        board.current = savedBoard;
        solvedBoard.current = savedSolvedBoard;
        startTime.current = Date.now() - savedTime;
        setTimerMillis(Date.now() - startTime.current);
        setMistakes(savedMistakes);
        setNotesTaken(savedNotesTaken);
        setTakingNotes(false);
        setSelectedVal(null);
        clearHighlights();
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

  const valCounts = ALL_NUMS.map(n => countInstances(board.current, n));

  return (
    <div id='app-base' className={`sudoku-colors`}>
      <div className='sudoku-container'>
        {valCounts.some(n => n !== 9) 
          ? <>
            <TopBar
              mistakes={mistakes}
              saveBoard={saveBoard}
              toggleTime={toggleTime}
              loadBoard={loadBoard}
            />
            <DisplayableBoard 
              onBoardClick={onBoardClick}
              board={board.current}
              highlightCell={highlightCell}
              selectedVal={selectedVal}
            />
            <SelectorPanel
              allNums={ALL_NUMS}
              valCounts={valCounts}
              selectedVal={selectedVal}
              onSelectorClick={onSelectorClick}
            />
            <ControlPanel
              onUndo={onUndo}
              runTimer={runTimer}
              toggleTime={toggleTime}
              timerMillis={timerMillis}
              takingNotes={takingNotes}
              setTakingNotes={setTakingNotes}
            />
          </>
          : <WinScreen
              timerMillis={timerMillis}
              mistakes={mistakes}
              notesTaken={notesTaken}
            />
        }
      </div>
    </div>
  );
};
