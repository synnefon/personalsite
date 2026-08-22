// Exhaustive check of the calendar puzzle solver: every month × weekday ×
// date combination (2604), in each dot mode. Verifies structure of every
// solution and reports worst-case solve cost.
//
//   npx ts-node --transpile-only src/calendar_puzzle/verify.ts

import { solve } from "./solver.ts";
import { COLS, DotMode, LABELS, NUM_CELLS, cellOf } from "./puzzle.ts";

const MONTHS = LABELS.slice(0, 3).flatMap((row) => row.slice(0, 4));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thur", "Fri", "Sat", "Sun"];
const DATES = Array.from({ length: 31 }, (_, i) => String(i + 1));
const MODES: DotMode[] = ["ignore", "all", "none"];

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let solves = 0;
let worstMs = 0;
let worstNodes = 0;
let worstCombo = "";
let totalMs = 0;

for (const mode of MODES) {
  const modeStart = Date.now();
  for (const month of MONTHS) {
    for (const weekday of WEEKDAYS) {
      for (const date of DATES) {
        const blocked = [cellOf(month), cellOf(weekday), cellOf(date)];
        const solution = solve(blocked, mode, 1);
        const combo = `${mode} ${month}/${weekday}/${date}`;
        check(solution !== null, `UNSOLVABLE: ${combo}`);
        if (solution === null) continue;

        const covered = new Set<number>();
        for (const placement of solution.placements) {
          for (const cell of placement.cells) {
            const idx = cell.y * COLS + cell.x;
            check(!covered.has(idx), `${combo}: cell ${idx} covered twice`);
            check(!blocked.includes(idx), `${combo}: window cell ${idx} covered`);
            covered.add(idx);
          }
          if (mode === "all") check(placement.dot !== null, `${combo}: hidden dot`);
          if (mode === "none") check(placement.dot === null, `${combo}: visible dot`);
        }
        check(covered.size === NUM_CELLS - 3, `${combo}: ${covered.size} cells covered`);
        check(
          new Set(solution.placements.map((p) => p.pieceIdx)).size === 10,
          `${combo}: piece reused`
        );

        solves++;
        totalMs += solution.ms;
        if (solution.nodes > worstNodes) {
          worstNodes = solution.nodes;
          worstMs = solution.ms;
          worstCombo = combo;
        }
      }
    }
  }
  console.log(`mode ${mode}: all 2604 combos solved in ${Date.now() - modeStart}ms`);
}

console.log(`\n${solves} solves, avg ${(totalMs / solves).toFixed(2)}ms`);
console.log(`worst: ${worstCombo} — ${worstNodes} nodes, ${worstMs.toFixed(1)}ms`);
