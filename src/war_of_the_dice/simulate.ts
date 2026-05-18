import {
  bucketKnob,
  makePersonality,
  selectBestAttack,
  type AIPersonality,
  type PersonalityBucket,
} from "./ai.ts";
import { resolveAttack } from "./combat.ts";
import { NUM_PLAYERS } from "./constants.ts";
import { playerIsEliminated, soleSurvivor } from "./gameLogic.ts";
import { generateMap } from "./mapGenerator.ts";
import { reinforcePlayer } from "./reinforcement.ts";

export type GameResult = {
  winner: number;
  personalities: AIPersonality[];
  rounds: number;
  completed: boolean;
};

const TRAITS = [
  "confidence",
  "expansion",
  "disruption",
  "caution",
  "pickiness",
  "predation",
] as const;

type Trait = (typeof TRAITS)[number];

const MAX_MOVES_PER_TURN = 250;
const DEFAULT_MAX_ROUNDS = 250;

// Run one full headless game: random map, fresh personalities, random turn
// order, every player driven by selectBestAttack. Returns the winner and
// the personality each player had this game.
export function runOneGame(maxRounds: number = DEFAULT_MAX_ROUNDS): GameResult {
  let map = generateMap();
  const personalities = Array.from({ length: NUM_PLAYERS }, () =>
    makePersonality()
  );
  const bank = new Array<number>(NUM_PLAYERS).fill(0);

  const turnOrder: number[] = [];
  for (let i = 0; i < NUM_PLAYERS; i++) turnOrder.push(i);
  for (let i = turnOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = turnOrder[i];
    turnOrder[i] = turnOrder[j];
    turnOrder[j] = tmp;
  }

  let turnIdx = 0;
  let round = 0;
  while (round < maxRounds) {
    const actor = turnOrder[turnIdx];

    if (!playerIsEliminated(map, actor)) {
      let movesThisTurn = 0;
      while (movesThisTurn++ < MAX_MOVES_PER_TURN) {
        const move = selectBestAttack(map, actor, personalities[actor]);
        if (!move) break;
        const result = resolveAttack(map, move.sourceId, move.targetId);
        map = result.map;
        const winnerMidTurn = soleSurvivor(map);
        if (winnerMidTurn !== null) {
          return {
            winner: winnerMidTurn,
            personalities,
            rounds: round,
            completed: true,
          };
        }
      }
      const r = reinforcePlayer(map, actor, bank[actor]);
      map = r.map;
      bank[actor] = r.bank;
    }

    const winner = soleSurvivor(map);
    if (winner !== null) {
      return { winner, personalities, rounds: round, completed: true };
    }

    turnIdx++;
    if (turnIdx >= turnOrder.length) {
      turnIdx = 0;
      round++;
    }
  }

  // Tied out — declare the territory leader.
  const counts = new Array<number>(NUM_PLAYERS).fill(0);
  for (const t of map.territories) counts[t.ownerId]++;
  let leader = 0;
  for (let i = 1; i < NUM_PLAYERS; i++) {
    if (counts[i] > counts[leader]) leader = i;
  }
  return { winner: leader, personalities, rounds: round, completed: false };
}

export type TraitStat = {
  meanAll: number;
  meanWinners: number;
  delta: number;
  winRateByBucket: Record<PersonalityBucket, number>;
};

export type Analysis = {
  totalGames: number;
  completedGames: number;
  meanRounds: number;
  perTrait: Record<Trait, TraitStat>;
};

function mean(arr: ReadonlyArray<number>): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

export function analyzeResults(results: ReadonlyArray<GameResult>): Analysis {
  const allValues: Record<Trait, number[]> = {} as Record<Trait, number[]>;
  const winnerValues: Record<Trait, number[]> = {} as Record<Trait, number[]>;
  const bucketCounts: Record<
    Trait,
    Record<PersonalityBucket, { players: number; wins: number }>
  > = {} as Record<
    Trait,
    Record<PersonalityBucket, { players: number; wins: number }>
  >;

  for (const t of TRAITS) {
    allValues[t] = [];
    winnerValues[t] = [];
    bucketCounts[t] = {
      "VERY LOW": { players: 0, wins: 0 },
      LOW: { players: 0, wins: 0 },
      NEUTRAL: { players: 0, wins: 0 },
      HIGH: { players: 0, wins: 0 },
      "VERY HIGH": { players: 0, wins: 0 },
    };
  }

  for (const r of results) {
    for (let i = 0; i < r.personalities.length; i++) {
      const p = r.personalities[i];
      const isWinner = i === r.winner;
      for (const t of TRAITS) {
        const v = p[t];
        allValues[t].push(v);
        if (isWinner) winnerValues[t].push(v);
        const b = bucketKnob(v);
        bucketCounts[t][b].players++;
        if (isWinner) bucketCounts[t][b].wins++;
      }
    }
  }

  const perTrait = {} as Record<Trait, TraitStat>;
  for (const t of TRAITS) {
    const mAll = mean(allValues[t]);
    const mWin = mean(winnerValues[t]);
    const winRateByBucket = {
      "VERY LOW": 0,
      LOW: 0,
      NEUTRAL: 0,
      HIGH: 0,
      "VERY HIGH": 0,
    } as Record<PersonalityBucket, number>;
    for (const b of [
      "VERY LOW",
      "LOW",
      "NEUTRAL",
      "HIGH",
      "VERY HIGH",
    ] as PersonalityBucket[]) {
      const { players, wins } = bucketCounts[t][b];
      winRateByBucket[b] = players === 0 ? 0 : wins / players;
    }
    perTrait[t] = {
      meanAll: mAll,
      meanWinners: mWin,
      delta: mWin - mAll,
      winRateByBucket,
    };
  }

  return {
    totalGames: results.length,
    completedGames: results.filter((r) => r.completed).length,
    meanRounds: mean(results.map((r) => r.rounds)),
    perTrait,
  };
}

export function simulateMany(n: number): {
  results: GameResult[];
  analysis: Analysis;
} {
  const results: GameResult[] = [];
  for (let i = 0; i < n; i++) results.push(runOneGame());
  return { results, analysis: analyzeResults(results) };
}
