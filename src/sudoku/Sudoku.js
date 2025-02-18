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
      return ({ ridx, cidx, val: c, color: null, notes: [], ignorable: null })
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
  const future = useRef([]);
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

  const updateTimeline = (ridx, cidx, cell, ignorable = false) => {
    history.current.push(makeRecord(ridx, cidx, cell, ignorable));
    future.current = [];
  }

  const setCell = ({ update, ridx, cidx, refresh = true, record = false, ignorable = false}) => {
    const newBoard = board.current;
    const cell = newBoard[ridx][cidx];

    if (record) {
      updateTimeline(ridx, cidx, cell, ignorable);
    }

    newBoard[ridx][cidx] = { ...cell, ...update };
    board.current = newBoard;

    if (refresh) forceRefresh();
  }

  const takeNote = (ridx, cidx, noteVal) => {
    const update = {};
    if (board.current[ridx][cidx].notes.includes(noteVal)) {
      update.notes = board.current[ridx][cidx].notes.filter(n => n !== noteVal);
    } else {
      update.notes = board.current[ridx][cidx].notes.concat([noteVal]);
      setNotesTaken(nt => nt + 1);
    }
    setCell({ update, ridx, cidx, record: true });
  }

  // does NOT refresh
  const updateNeighbors = (makeUpdate, r, c, record = false, ignorable = false) => {
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
      const update = makeUpdate(ridx, cidx);
      if (update) {
        setCell({ update: makeUpdate(ridx, cidx), ridx, cidx, record, ignorable, refresh: false });
      }
    }
  }

  const clearLikeNotes = (ridx, cidx, filterVal, record=true) => {
    const filterNotes = (notes) => notes.filter(n => n !== filterVal);
    const makeUpdate = (r, c) => {
      const neighborUpdate = { notes: filterNotes(board.current[r][c].notes) };
      return board.current[r][c].val === '.' ? neighborUpdate : false; 
    };

    updateNeighbors(makeUpdate, ridx, cidx, record, true);
  }

  const updateCell = (ridx, cidx, updateVal) => {
    if (updateVal === board.current[ridx][cidx].val) {
      setCell({ update: { color: null, val: "." }, ridx, cidx, record: true });
      return;
    };

    const isCorrect = solvedBoard.current[ridx][cidx].val === updateVal;
    if (isCorrect) {
      clearLikeNotes(ridx, cidx, updateVal);
    } else {
      setMistakes(m => m + 1);
    }

    const update = { val: updateVal, color: isCorrect ? 'new-text' : 'incorrect' };
    setCell({ update, ridx, cidx, record: true });
  }

  // does NOT refresh
  const clearHighlights = () => {
    if (!highlightCell) return;
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
      takeNote(ridx, cidx, selectedVal);
    } else {
      updateCell(ridx, cidx, selectedVal);
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

  const makeRecord = (ridx, cidx, update, ignorable) => {
    return ({ridx, cidx, update, ignorable});
  }

  const onUndo = () => {
    const travelBackwards = () => {
      let r = history.current.pop();
      let update = r.update;
      if (!r.ignorable) future.current.push(makeRecord(r.ridx, r.cidx, board.current[r.ridx][r.cidx], r.ignorable));
      board.current[r.ridx][r.cidx] = {...board.current[r.ridx][r.cidx], ...update};
    }

    if (history.current.length === 0) return;

    clearHighlights();
    while (history.current.length > 0) {
      if (!history.current[history.current.length-1].ignorable) break;
      travelBackwards();
    }
    travelBackwards();

    forceRefresh();
  };

  const onRedo = () => {
    if (future.current.length === 0) return;

    clearHighlights();

    const r = future.current.pop();

    const boardCell = board.current[r.ridx][r.cidx];

    history.current.push(makeRecord(r.ridx, r.cidx, boardCell, false));

    const isCorrect = solvedBoard.current[r.ridx][r.cidx].val === r.update.val;
    if (isCorrect) {
      clearLikeNotes(r.ridx, r.cidx, r.update.val);
    }
    setCell({update: r.update, ridx: r.ridx, cidx: r.cidx, refresh: false })

    forceRefresh();
  };

  const toggleTime = (b) => {
    if (!b) {
      setRunTimer(false);
    } else {
      startTime.current = Date.now() - timerMillis;
      setRunTimer(true);
    }
  }

  const saveBoard = async () => {
    return signInUser().then(async (uid) => {
      const boardString = encryptBoardState(board.current, solvedBoard.current, timerMillis, mistakes, notesTaken);
      return writeBoard(uid, boardString).catch(e => e);
    }).catch(e => e);
  }

  const loadBoard = async () => {
    return signInUser().then(async (uid) => {
      return getBoard(uid).then(b => {
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
        history.current = [];
        future.current = [];
      }).catch(e => e);
    }).catch(e => e);
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
              runTimer={runTimer}
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
              onRedo={onRedo}
              runTimer={runTimer}
              toggleTime={toggleTime}
              timerMillis={timerMillis}
              takingNotes={takingNotes}
              setTakingNotes={setTakingNotes}
            />
          </>
          : <WinScreen
            timerMillis={timerMillis}
            toggleTime={toggleTime}
            mistakes={mistakes}
            notesTaken={notesTaken}
          />
        }
      </div>
    </div>
  );
};
