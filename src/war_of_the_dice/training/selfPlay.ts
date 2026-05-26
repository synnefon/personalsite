import { resolveAttack } from "../combat.ts";
import { NUM_PLAYERS } from "../constants.ts";
import { playerIsEliminated, soleSurvivor } from "../gameLogic.ts";
import { generateMap } from "../mapGenerator.ts";
import {
  encodeAdjacency,
  encodeBoard,
  type EncodedAdjacency,
  type EncodedBoard,
} from "../model/encoding.ts";
import type { ModelWeights } from "../model/forward.ts";
import type { ArchetypeId } from "../model/personalities.ts";
import {
  enumerateLegalAttacks,
  makeValueCache,
  sampleAttackByValue,
  selectBestAttackForArchetype,
  type ValueCache,
} from "../model/policy.ts";
import { reinforcePlayer } from "../reinforcement.ts";
import type { AttackMove, GameMap } from "../types.ts";
import { shuffleInPlace } from "./util.ts";

/**
 * Everything a policy needs to make one decision. The runner builds this
 * once per decision (encoding + legal moves), so the policy doesn't have to.
 */
export type DecisionContext = {
  map: GameMap;
  playerId: number;
  turnIndex: number;
  encodedBoard: EncodedBoard;
  adjacency: EncodedAdjacency;
  legalMoves: ReadonlyArray<AttackMove>;
  /**
   * Per-turn memo of value-network outputs, shared across every decision
   * in the current actor's turn. Cleared by the runner when the actor
   * changes. Policies SHOULD pass this through to the value-network calls
   * to avoid recomputing V(board) for the same board.
   */
  cache: ValueCache;
};

/**
 * Decision rule for one player at one step. Returning null = pass the turn.
 * Must return either null or a move present in `ctx.legalMoves`.
 */
export type Policy = (ctx: DecisionContext) => AttackMove | null;

/**
 * One state visited during a game, recorded for value-network training.
 * The label (`win`) is set to true iff `playerId` is the eventual winner;
 * one (state, label) pair per (turn, seat) is generated per game.
 */
export type ValueSample = {
  playerId: number;
  board: EncodedBoard;
  win: boolean;
};

export type GameResult = {
  winner: number;
  rounds: number;
  completed: boolean;
  adjacency: EncodedAdjacency;
  samples: ValueSample[];
  /** Aggregate V-cache hit/miss totals across every actor turn in the
   *  game. `hits + misses` = total V(board) lookups during the game. */
  cacheHits: number;
  cacheMisses: number;
};

const DEFAULT_MAX_MOVES_PER_TURN = 250;
const DEFAULT_MAX_ROUNDS = 250;

/** Fresh shuffled turn order across all NUM_PLAYERS players. */
function freshTurnOrder(rng: () => number = Math.random): number[] {
  const order: number[] = [];
  for (let i = 0; i < NUM_PLAYERS; i++) order.push(i);
  shuffleInPlace(order, rng);
  return order;
}

/**
 * Find which index in `candidates` corresponds to `chosen`. Returns -1 if
 * chosen is null (the policy passed). Throws if the move isn't in the
 * legal set — a misbehaving policy must fail loudly.
 */
function assertLegal(
  candidates: ReadonlyArray<AttackMove>,
  chosen: AttackMove | null,
): void {
  if (!chosen) return;
  for (const c of candidates) {
    if (c.sourceId === chosen.sourceId && c.targetId === chosen.targetId) {
      return;
    }
  }
  throw new Error(
    `policy returned illegal move (${chosen.sourceId}→${chosen.targetId})`,
  );
}

/**
 * Pick the territory leader when the game runs out the clock. Ties broken
 * randomly so we don't bias toward seat 0.
 */
function pickLeader(map: GameMap, rng: () => number): number {
  const counts = new Array<number>(NUM_PLAYERS).fill(0);
  for (const t of map.territories) counts[t.ownerId]++;
  let maxCount = -1;
  const leaders: number[] = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    if (counts[i] > maxCount) {
      maxCount = counts[i];
      leaders.length = 0;
      leaders.push(i);
    } else if (counts[i] === maxCount) {
      leaders.push(i);
    }
  }
  return leaders[Math.floor(rng() * leaders.length)];
}

/**
 * Run one full headless game with the given per-seat policies and return
 * the outcome plus value-network training samples.
 *
 * At every decision point (each time it's a non-eliminated player's turn
 * to choose pass/attack), we snapshot the encoded board from that seat's
 * POV. After the game ends we label each snapshot with `win = (seat ==
 * winner)`. No reward shaping, no smearing — every snapshot gets the
 * binary game outcome from the seat's perspective.
 */
export function runOneGame(
  policies: Policy[],
  maxRounds: number = DEFAULT_MAX_ROUNDS,
  maxMovesPerTurn: number = DEFAULT_MAX_MOVES_PER_TURN,
  rng: () => number = Math.random,
  /**
   * When false, skip storing per-decision encoded boards in
   * `pendingSamples`. The returned `samples` array is empty. Use this for
   * pure simulation (round-robin, evaluation) where you don't need value-
   * network training samples — saves ~tens of MB per game in Float32Array
   * allocations that would otherwise live until game end.
   */
  recordSamples = true,
): GameResult {
  let map = generateMap();
  const adjacency = encodeAdjacency(map);
  const bank = new Array<number>(NUM_PLAYERS).fill(0);
  const pendingSamples: { playerId: number; board: EncodedBoard }[] = [];

  const turnOrder = freshTurnOrder(rng);
  const isAlive = new Array<boolean>(NUM_PLAYERS).fill(true);

  let turnIdx = 0;
  let round = 0;
  let winner: number | null = null;
  let completed = false;
  let cacheHits = 0;
  let cacheMisses = 0;

  outer: while (round < maxRounds) {
    const actor = turnOrder[turnIdx];

    if (!playerIsEliminated(map, actor)) {
      // Fresh per-turn V(board) cache. Stale entries across turns would
      // be wrong (turnIndex/actor changed), so clear it here.
      const turnCache: ValueCache = makeValueCache();
      let movesThisTurn = 0;
      while (movesThisTurn++ < maxMovesPerTurn) {
        const legal = enumerateLegalAttacks(map, actor);
        if (legal.length === 0) break;

        const encodedBoard = encodeBoard(map, actor, round);
        if (recordSamples) {
          pendingSamples.push({ playerId: actor, board: encodedBoard });
        }

        const action = policies[actor]({
          map,
          playerId: actor,
          turnIndex: round,
          encodedBoard,
          adjacency,
          legalMoves: legal,
          cache: turnCache,
        });
        assertLegal(legal, action);
        if (!action) break;

        const result = resolveAttack(map, action.sourceId, action.targetId);
        map = result.map;
        for (let p = 0; p < NUM_PLAYERS; p++) {
          if (isAlive[p] && playerIsEliminated(map, p)) isAlive[p] = false;
        }
        const w = soleSurvivor(map);
        if (w !== null) {
          winner = w;
          completed = true;
          break outer;
        }
      }
      cacheHits += turnCache.hits;
      cacheMisses += turnCache.misses;
      const r = reinforcePlayer(map, actor, bank[actor]);
      map = r.map;
      bank[actor] = r.bank;
    }

    const w = soleSurvivor(map);
    if (w !== null) {
      winner = w;
      completed = true;
      break;
    }

    turnIdx++;
    if (turnIdx >= turnOrder.length) {
      turnIdx = 0;
      round++;
    }
  }

  if (winner === null) winner = pickLeader(map, rng);

  const samples: ValueSample[] = pendingSamples.map((p) => ({
    ...p,
    win: p.playerId === winner,
  }));

  return {
    winner,
    rounds: round,
    completed,
    adjacency,
    samples,
    cacheHits,
    cacheMisses,
  };
}

/**
 * Build a value-network Policy that softmax-samples over Q values at
 * temperature `temp`. Used for exploration during self-play training.
 *
 * `lookaheadDepth` controls expectimax search within the turn for each Q
 * evaluation: 1 = original 1-ply, 2 = one extra move, 3 = two more. Self-
 * play data quality benefits from deeper search (AlphaZero-style — better
 * data → better training signal), at the cost of per-decision wall time.
 */
/**
 * Build a Policy that uses `selectBestAttackForArchetype` for a single fixed
 * archetype, threading `ctx.cache` through. Use this whenever you'd
 * otherwise inline the same call shape (round-robin runner, browser AI
 * dispatcher, etc).
 */
export function policyFromArchetype(
  weights: ModelWeights,
  archetype: ArchetypeId,
): Policy {
  return (ctx) =>
    selectBestAttackForArchetype(
      ctx.map,
      ctx.playerId,
      ctx.turnIndex,
      ctx.adjacency,
      weights,
      archetype,
      undefined,
      ctx.legalMoves,
      ctx.cache,
    );
}

export function samplingValuePolicy(
  weights: ModelWeights,
  temp: number,
  rng: () => number = Math.random,
  lookaheadDepth = 1,
): Policy {
  const remainingDepth = Math.max(0, lookaheadDepth - 1);
  return (ctx) =>
    sampleAttackByValue(
      ctx.map,
      ctx.playerId,
      ctx.turnIndex,
      ctx.adjacency,
      weights,
      temp,
      rng,
      ctx.legalMoves,
      remainingDepth,
      ctx.cache,
    );
}
