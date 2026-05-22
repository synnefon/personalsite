import {
  makePersonality,
  selectBestAttack,
  winProbability,
  type AIMove,
  type AIPersonality,
} from "../ai.ts";
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
import type { PersonalityId } from "../model/personalities.ts";
import {
  enumerateLegalAttacks,
  sampleAttackModel,
  selectBestAttackModel,
} from "../model/policy.ts";
import { reinforcePlayer } from "../reinforcement.ts";
import type { GameMap } from "../types.ts";
import { shapingReward, terminalReward } from "./rewards.ts";
import { shuffleInPlace } from "./util.ts";

/**
 * Everything a policy needs to make one decision. The runner builds this
 * once per decision (encoding + legal moves), so the policy doesn't have to
 * — and so the resulting training partial uses the *same* encoding the
 * policy saw (no risk of divergence).
 */
export type DecisionContext = {
  map: GameMap;
  playerId: number;
  encodedBoard: EncodedBoard;
  adjacency: EncodedAdjacency;
  legalMoves: ReadonlyArray<AIMove>;
};

/**
 * Decision rule for one player at one step. Returning null = pass the turn.
 * Must return either null or a move present in `ctx.legalMoves`; the runner
 * asserts this and will throw otherwise.
 */
export type Policy = (ctx: DecisionContext) => AIMove | null;

/**
 * One candidate attack with its win probability precomputed at decision
 * time so training samples are self-contained (no need to re-derive from
 * a no-longer-available game state).
 */
export type CandidateWithProb = {
  sourceId: number;
  targetId: number;
  winProb: number;
};

/**
 * One labeled training sample. `target` is the regression target for the
 * chosen action's Q logit — per-decision shaping reward plus this seat's
 * smeared terminal reward, both functions of the acting seat's personality.
 */
export type DecisionRecord = {
  playerId: number;
  turnIndex: number;
  board: EncodedBoard;
  candidates: CandidateWithProb[];
  chosenIdx: number;
  target: number;
};

export type GameResultWithLog = {
  winner: number;
  rounds: number;
  completed: boolean;
  adjacency: EncodedAdjacency;
  decisions: DecisionRecord[];
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
 * Attach winProbs to each legal attack, computed against the current dice
 * counts. Returns a self-contained candidate list usable for training.
 */
function decorateCandidates(
  map: GameMap,
  moves: ReadonlyArray<AIMove>,
): CandidateWithProb[] {
  return moves.map((m) => ({
    sourceId: m.sourceId,
    targetId: m.targetId,
    winProb: winProbability(
      map.territories[m.sourceId].dice,
      map.territories[m.targetId].dice,
    ),
  }));
}

/**
 * Find which index in `candidates` corresponds to `chosen`. Returns -1 if
 * chosen is null (the policy passed). Throws if the move isn't in the legal
 * set — a misbehaving policy must fail loudly so we don't silently train on
 * garbage transitions.
 */
function indexOfChosen(
  candidates: ReadonlyArray<AIMove>,
  chosen: AIMove | null,
): number {
  if (!chosen) return -1;
  for (let i = 0; i < candidates.length; i++) {
    if (
      candidates[i].sourceId === chosen.sourceId &&
      candidates[i].targetId === chosen.targetId
    ) {
      return i;
    }
  }
  throw new Error(
    `policy returned illegal move (${chosen.sourceId}→${chosen.targetId}); not in legal set`,
  );
}

/**
 * One in-progress decision before terminal smearing — same shape as
 * DecisionRecord but stores raw shaping reward, which gets combined with
 * the seat's terminal share after the game ends.
 */
type PartialDecision = Omit<DecisionRecord, "target"> & {
  shaping: number;
};

/**
 * Apply terminal-reward smearing across a seat's decisions. Each seat's
 * terminal reward (function of personality and final rank) is divided
 * evenly over the count of decisions it made, and added to the per-decision
 * shaping reward. Survivors at game timeout are treated as runners-up
 * (rank = NUM_PLAYERS).
 */
function applyTerminalRewards(
  partials: ReadonlyArray<PartialDecision>,
  finalRank: ReadonlyArray<number>,
  personalities: ReadonlyArray<PersonalityId>,
): DecisionRecord[] {
  const decisionsCount = new Array<number>(NUM_PLAYERS).fill(0);
  for (const p of partials) decisionsCount[p.playerId]++;

  const seatTerminal = new Array<number>(NUM_PLAYERS).fill(0);
  for (let p = 0; p < NUM_PLAYERS; p++) {
    if (decisionsCount[p] === 0) continue;
    const rank = finalRank[p] === -1 ? NUM_PLAYERS : finalRank[p];
    seatTerminal[p] = terminalReward(personalities[p], rank);
  }

  return partials.map((d) => {
    const { shaping, ...rest } = d;
    const share = seatTerminal[d.playerId] / decisionsCount[d.playerId];
    return { ...rest, target: shaping + share };
  });
}

/**
 * Pick the territory-leader when the game runs out the clock at maxRounds.
 * Ties are broken randomly so we don't bias toward seat 0.
 */
function pickLeader(
  map: GameMap,
  rng: () => number,
): number {
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
 * Run one full headless game with the given per-seat policies + matching
 * personalities, and return the outcome plus a complete decision log.
 *
 * Per turn, the actor's policy is invoked repeatedly until it returns null
 * (pass) or hits the move cap; then reinforcement runs and the next
 * non-eliminated player goes. Per-decision shaping reward is recorded
 * inline; terminal reward is smeared across each seat's decisions at game
 * end. If the game runs out the clock at maxRounds, the territory leader
 * is declared winner (ties broken randomly) so every decision still gets a
 * label.
 *
 * Each decision encodes the board exactly once. The encoded board is
 * threaded through to the policy via DecisionContext and reused for the
 * training partial — no double-encoding.
 */
export function runOneGameWithPolicy(
  policies: Policy[],
  personalities: ReadonlyArray<PersonalityId>,
  maxRounds: number = DEFAULT_MAX_ROUNDS,
  maxMovesPerTurn: number = DEFAULT_MAX_MOVES_PER_TURN,
  rng: () => number = Math.random,
): GameResultWithLog {
  let map = generateMap();
  const adjacency = encodeAdjacency(map);
  const bank = new Array<number>(NUM_PLAYERS).fill(0);
  const partials: PartialDecision[] = [];

  const turnOrder = freshTurnOrder(rng);

  // finalRank[p] = 1 for the eventual winner; 2..N for eliminations in
  // reverse-chronological order; -1 for survivors at maxRounds (treated
  // as runners-up below).
  const finalRank = new Array<number>(NUM_PLAYERS).fill(-1);
  let eliminationsCount = 0;
  const isAlive = new Array<boolean>(NUM_PLAYERS).fill(true);

  let turnIdx = 0;
  let round = 0;
  let winner: number | null = null;
  let completed = false;

  const checkEliminations = (currentMap: GameMap): void => {
    for (let p = 0; p < NUM_PLAYERS; p++) {
      if (isAlive[p] && playerIsEliminated(currentMap, p)) {
        isAlive[p] = false;
        eliminationsCount++;
        finalRank[p] = NUM_PLAYERS - eliminationsCount + 1;
      }
    }
  };

  outer: while (round < maxRounds) {
    const actor = turnOrder[turnIdx];

    if (!playerIsEliminated(map, actor)) {
      let movesThisTurn = 0;
      while (movesThisTurn++ < maxMovesPerTurn) {
        const legal = enumerateLegalAttacks(map, actor);
        if (legal.length === 0) break;

        const encodedBoard = encodeBoard(
          map,
          actor,
          round,
          personalities[actor],
        );
        const action = policies[actor]({
          map,
          playerId: actor,
          encodedBoard,
          adjacency,
          legalMoves: legal,
        });
        const candidates = decorateCandidates(map, legal);
        const chosenIdx = indexOfChosen(legal, action);
        const winProb =
          chosenIdx === -1 ? 0 : candidates[chosenIdx].winProb;
        const shaping = shapingReward(personalities[actor], {
          isAttack: chosenIdx !== -1,
          winProb,
        });
        partials.push({
          playerId: actor,
          turnIndex: round,
          board: encodedBoard,
          candidates,
          chosenIdx,
          shaping,
        });
        if (!action) break;

        const result = resolveAttack(map, action.sourceId, action.targetId);
        map = result.map;
        checkEliminations(map);
        const w = soleSurvivor(map);
        if (w !== null) {
          winner = w;
          completed = true;
          break outer;
        }
      }
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

  if (winner === null) {
    winner = pickLeader(map, rng);
  }
  finalRank[winner] = 1;

  const decisions = applyTerminalRewards(partials, finalRank, personalities);
  return { winner, rounds: round, completed, adjacency, decisions };
}

/**
 * Build a Policy that uses the existing linear selectBestAttack with a
 * (possibly fixed) AI personality (the v1 linear-AI personality vector,
 * unrelated to v2's archetype conditioning). Default: fresh random vector.
 */
export function linearPolicy(
  personality: AIPersonality = makePersonality(),
): Policy {
  return (ctx) => selectBestAttack(ctx.map, ctx.playerId, personality);
}

/**
 * Build a Policy that uses the NN's greedy selectBestAttackModel. The
 * personality conditioning is baked into the encoded board the runner
 * passes in via DecisionContext, so this closure only needs weights.
 */
export function greedyNeuralPolicy(weights: ModelWeights): Policy {
  return (ctx) =>
    selectBestAttackModel(
      ctx.map,
      ctx.playerId,
      weights,
      ctx.encodedBoard,
      ctx.adjacency,
      ctx.legalMoves,
    );
}

/**
 * Build a Policy that softmax-samples NN actions at temperature `temp`,
 * with personality conditioning baked into the encoded board. Used for
 * exploration during self-play training.
 */
export function samplingNeuralPolicy(
  weights: ModelWeights,
  temp: number,
  rng: () => number = Math.random,
): Policy {
  return (ctx) =>
    sampleAttackModel(
      ctx.map,
      ctx.playerId,
      weights,
      ctx.encodedBoard,
      ctx.adjacency,
      temp,
      rng,
      ctx.legalMoves,
    );
}
