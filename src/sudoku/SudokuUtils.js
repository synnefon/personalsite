import seedrandom from 'seedrandom';

import { encryptString, decryptString } from '../util/Encryption';

const shuffle = (array, rng) => {
  for (let currIndex = array.length - 1; currIndex > 0; currIndex--) {
    const randIdx = Math.floor(rng() * currIndex);
    [array[currIndex], array[randIdx]] = [array[randIdx], array[currIndex]];
  }
}

const makeBlankBoard = (dim) => {
  return Array.from({ length: dim }, () => Array.from({ length: dim }, () => '.'));
}

const solveSudoku = ({ board, rng = null, countSolns = false }) => {
  const DIM = 9;
  const CELL_OPTIONS = Array.from({ length: DIM }, (_, i) => (i + 1));

  const rows = Array.from({ length: DIM }, () => Array(DIM + 1).fill(false));
  const cols = Array.from({ length: DIM }, () => Array(DIM + 1).fill(false));
  const boxes = Array.from({ length: DIM }, () => Array(DIM + 1).fill(false));
  const emptyCells = [];

  for (let row = 0; row < board.length; row++) {
    const rowData = board[row];
    for (let col = 0; col < rowData.length; col++) {
      const cell = rowData[col];
      if (cell === ".") {
        emptyCells.push([row, col]);
      } else {
        const num = parseInt(cell);
        rows[row][num] = true;
        cols[col][num] = true;
        boxes[Math.floor(row / 3) * 3 + Math.floor(col / 3)][num] = true;
      }
    }
  }

  const getCandidates = (row, col) => {
    const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
    const ret = CELL_OPTIONS.filter(num => !rows[row][num] && !cols[col][num] && !boxes[box][num]);
    if (rng) {
      shuffle(ret, rng);
    }
    return ret;
  }

  const updateCache = (row, col, num, val) => {
    rows[row][num] = val;
    cols[col][num] = val;
    boxes[Math.floor(row / 3) * 3 + Math.floor(col / 3)][num] = val;
  }

  var numSolns = 0;

  const fillBoard = (idx) => {
    if (emptyCells.length === idx) {
      numSolns += 1;
      return true;
    }

    const [row, col] = emptyCells[idx];
    const candidates = getCandidates(row, col);
    for (const num of candidates) {
      updateCache(row, col, num, true);
      board[row][col] = num.toString();

      if (fillBoard(idx + 1)) {
        if (!countSolns || numSolns > 1) return true;
      }

      updateCache(row, col, num, false);
    }

    return false;
  };

  fillBoard(0);

  return numSolns;
};

const unsolveSudoku = (board, rng) => {
  const cells = [];
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      cells.push([row, col]);
    }
  }

  shuffle(cells, rng);

  for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
    const [row, col] = cells[cellIdx];
    const savedCell = board[row][col];
    board[row][col] = ".";

    const numSolns = solveSudoku({ board: structuredClone(board), countSolns: true });
    if (numSolns > 1) {
      board[row][col] = savedCell;
    }
  }
}

const generateRandomSeed = () => {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let seed = '';
  for (let i = 0; i < 16; i++) {
    seed += chars[Math.floor(Math.random() * chars.length)];
  }
  return seed;
};

export const makeSudoku = (providedSeed = null) => {
  console.log(new Date())
  const seed = providedSeed !== null ? providedSeed : generateRandomSeed();
  const rng = seedrandom(seed);
  const board = makeBlankBoard(9);
  solveSudoku({ board: board, rng });
  const solvedBoard = structuredClone(board);
  unsolveSudoku(board, rng);
  return ({
    board: board,
    solvedBoard: solvedBoard,
    randomSeed: seed,
  });
}

export const encryptBoardState = (savedBoard, savedSolvedBoard, savedTime, savedMistakes, savedNotesTaken) => {
  const str = JSON.stringify({ savedBoard, savedSolvedBoard, savedTime, savedMistakes, savedNotesTaken });
  return encryptString(str);
}

export const decryptBoardState = (encrypted) => {
  const str = decryptString(encrypted);
  const { savedBoard, savedSolvedBoard, savedTime, savedMistakes, savedNotesTaken } = JSON.parse(str);
  return ({ savedBoard, savedSolvedBoard, savedTime, savedMistakes, savedNotesTaken });
}
