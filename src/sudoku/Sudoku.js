import { useEffect, useMemo, useRef, useState } from 'react';
import { signInUser, writeBoard, getBoard } from "../Database";

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
      return ({ ridx, cidx, val: c, color: null, notes: [] })
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

  const getSeedFromUrl = () => {
    const hash = window.location.hash;
    const hashParts = hash.split('?');
    const params = new URLSearchParams(hashParts[1] || '');
    return params.get('seed') || null;
  };

  const [currentSeed, setCurrentSeed] = useState(() => {
    // On initial load, clear any seed from URL to generate a new puzzle
    const hash = window.location.hash;
    const hashParts = hash.split('?');
    if (hashParts[1]) {
      const params = new URLSearchParams(hashParts[1]);
      if (params.has('seed')) {
        // Clear the seed from URL on reload
        params.delete('seed');
        const newHash = params.toString() ? `${hashParts[0]}?${params.toString()}` : hashParts[0];
        window.history.replaceState({}, '', `${window.location.pathname}${newHash}`);
      }
    }
    return null;
  });
  const sudoku = useMemo(() => makeSudoku(currentSeed), [currentSeed]);
  const board = useRef(makeColorBoard(sudoku.board));
  const solvedBoard = useRef(makeColorBoard(sudoku.solvedBoard));
  const history = useRef([]);
  const future = useRef([]);
  const startTime = useRef(Date.now());
  const previousSelectedVal = useRef(null);

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

  const updateTimeline = (cells) => {
    history.current.push(cells);
    future.current = [];
  }

  const setCells = ({ updates, refresh = true, record = false }) => {
    const savedCells = [];
    for (let update of updates) {
      const ridx = update.ridx;
      const cidx = update.cidx;
      const newBoard = board.current;
      const cell = newBoard[ridx][cidx];

      if (record) savedCells.push(cell);

      newBoard[ridx][cidx] = { ...cell, ...update };
      board.current = newBoard;
    }

    if (savedCells.length > 0) updateTimeline(savedCells);
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
    const updates = [{ ...update, ridx, cidx }];
    setCells({ updates, ridx, cidx, record: true });
  }

  const getNeighbors = (ridx, cidx) => {
    const neighbors = new Set();
    for (let i = 0; i < 9; i++) {
      // sub grid
      const gridRow = (Math.floor(ridx / 3) * 3) + Math.floor(i / 3);
      const gridCol = (Math.floor(cidx / 3) * 3) + (i % 3);
      if (ridx !== gridRow && cidx !== gridCol) {
        neighbors.add({ ridx: gridRow, cidx: gridCol });
      }
      // row and col
      if (i !== cidx) neighbors.add({ ridx, cidx: i });
      if (i !== ridx) neighbors.add({ ridx: i, cidx });
    }
    return neighbors;
  }

  // does NOT refresh
  const getNeighborUpdates = (makeUpdate, r, c) => {
    const cellsToUpdate = getNeighbors(r, c);
    const updates = []

    for (let { ridx, cidx } of cellsToUpdate) {
      const update = makeUpdate(ridx, cidx);
      if (update) {
        updates.push({ ...update, ridx, cidx })
      }
    }

    return updates;
  }

  const getClearableLikeNoteCells = (ridx, cidx, filterVal) => {
    const filterNotes = (notes) => notes.filter(n => n !== filterVal);
    const makeUpdate = (r, c) => {
      const neighborUpdate = { notes: filterNotes(board.current[r][c].notes) };
      let shouldFilter = board.current[r][c].val === '.';
      if (board.current[r][c].val === filterVal) {
        neighborUpdate.val = '.';
        neighborUpdate.color = null;
        shouldFilter = true;
      }
      return shouldFilter ? neighborUpdate : false;
    };

    return getNeighborUpdates(makeUpdate, ridx, cidx);
  }

  const updateCell = (ridx, cidx, updateVal) => {
    if (updateVal === board.current[ridx][cidx].val) {
      const updates = [{ color: null, val: ".", ridx, cidx }]
      setCells({ updates, ridx, cidx, record: true });
      return;
    };

    let updates = [];
    const isCorrect = solvedBoard.current[ridx][cidx].val === updateVal;
    if (isCorrect) {
      updates = [...getClearableLikeNoteCells(ridx, cidx, updateVal), ...updates];
    } else {
      setMistakes(m => m + 1);
    }

    updates.push({ ridx, cidx, val: updateVal, color: isCorrect ? 'new-text' : 'incorrect' });
    setCells({ updates, ridx, cidx, record: true });
  }

  // does NOT refresh
  const clearHighlights = () => {
    if (!highlightCell) return;
    setHighlightCell(null);
    if (previousSelectedVal.current !== null) {
      setSelectedVal(previousSelectedVal.current);
      previousSelectedVal.current = null;
    }
    const update = { highlightColor: null, textHighlight: null };
    for (let ridx = 0; ridx < 9; ridx++) {
      for (let cidx = 0; cidx < 9; cidx++) {
        const updates = [{ ...update, ridx, cidx }];
        setCells({ updates, ridx, cidx, refresh: false });
      }
    }
  }

  const highlightStuff = (ridx, cidx) => {
    const isHighlighted = cellsEq(board.current[ridx][cidx], highlightCell);

    const epicenterUpdate = isHighlighted
      ? { highlightColor: null, ridx, cidx }
      : { highlightColor: 'epicenter', ridx, cidx };

    const makeNeighborUpdate = (r, c) => isHighlighted
      ? { highlightColor: null, r, c }
      : { highlightColor: 'highlight', r, c };

    const neighborUpdates = getNeighborUpdates(makeNeighborUpdate, ridx, cidx);

    const updates = [epicenterUpdate];
    for (let update of neighborUpdates) {
      updates.push(update);
    }

    setCells({ updates, record: false, refresh: true });

    setHighlightCell(isHighlighted ? null : board.current[ridx][cidx]);
  }

  const onBoardClick = (ridx, cidx) => {
    const clickedCell = board.current[ridx][cidx];
    const isClickingHighlightedCell = cellsEq(clickedCell, highlightCell);

    clearHighlights();

    if (clickedCell.val === solvedBoard.current[ridx][cidx].val) {
      if (!isClickingHighlightedCell) {
        // Highlighting - save current selectedVal and clear it
        previousSelectedVal.current = selectedVal;
        highlightStuff(ridx, cidx);
        setSelectedVal(null);
      }
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
    previousSelectedVal.current = null;
    if (selectedVal === null || selectedVal !== n) {
      setSelectedVal(n);
    } else {
      setSelectedVal(null);
    }
  }

  const travelThroughTime = (from, to) => {
    if (to.current.length === 0) return;

    clearHighlights();

    let cells = to.current.pop();
    from.current.push(cells.map(cell => board.current[cell.ridx][cell.cidx]));
    for (let cell of cells) {
      board.current[cell.ridx][cell.cidx] = cell;
    }

    forceRefresh();
  }

  const onUndo = () => travelThroughTime(future, history);
  const onRedo = () => travelThroughTime(history, future);

  const toggleTime = (b) => {
    if (!b) {
      setRunTimer(false);
    } else {
      startTime.current = Date.now() - timerMillis;
      setRunTimer(true);
    }
  }

  const saveBoard = async () => {
    return signInUser().then(async () => {
      const boardString = encryptBoardState(board.current, solvedBoard.current, timerMillis, mistakes, notesTaken);
      return writeBoard(boardString).catch(async e => e);
    }).catch(e => e);
  }

  const loadBoard = async () => {
    return signInUser().then(async () => {
      return getBoard().then(b => {
        const {
          savedBoard, savedSolvedBoard, savedTime, savedMistakes, savedNotesTaken
        } = decryptBoardState(b.val());
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

  useEffect(() => {
    const handleHashChange = () => {
      const newSeed = getSeedFromUrl();
      if (newSeed !== currentSeed) {
        setCurrentSeed(newSeed);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentSeed]);

  useEffect(() => {
    board.current = makeColorBoard(sudoku.board);
    solvedBoard.current = makeColorBoard(sudoku.solvedBoard);
    history.current = [];
    future.current = [];
    startTime.current = Date.now();
    previousSelectedVal.current = null;
    setSelectedVal(null);
    setTakingNotes(false);
    setHighlightCell(null);
    setMistakes(0);
    setTimerMillis(0);
    setRunTimer(true);
    setNotesTaken(0);
    forceRefresh();
  }, [sudoku]);

  useEffect(() => {
    const hash = window.location.hash;
    const hashParts = hash.split('?');
    const hashPath = hashParts[0];
    const params = new URLSearchParams(hashParts[1] || '');
    const urlSeed = params.get('seed');

    if (urlSeed !== String(sudoku.randomSeed)) {
      params.set('seed', sudoku.randomSeed);
      window.history.replaceState({}, '', `${window.location.pathname}${hashPath}?${params.toString()}`);
    }
  }, [sudoku.randomSeed]);

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