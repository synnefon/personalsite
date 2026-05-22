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
import {
  enumerateLegalAttacks,
  sampleAttackModel,
  selectBestAttackModel,
} from "../model/policy.ts";
import type { ModelWeights } from "../model/forward.ts";
import { reinforcePlayer } from "../reinforcement.ts";
import type { GameMap } from "../types.ts";

/**
 * Decision rule for one player at one step. Returning null = pass the turn.
 * The same Policy is invoked many times per game (once per move within a
 * turn). `adjacency` is precomputed and held constant for the whole game.
 */
export type Policy = (
  map: GameMap,
  playerId: number,
  turnIndex: number,
  adjacency: EncodedAdjacency,
) => AIMove | null;

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
 * One labeled training sample: the board the policy saw, the legal moves
 * available (with winProbs), the index of the action it chose (-1 = pass),
 * and (after the game ends) whether the acting player went on to win.
 */
export type DecisionRecord = {
  playerId: number;
  turnIndex: number;
  board: EncodedBoard;
  candidates: CandidateWithProb[];
  chosenIdx: number;
  won: boolean;
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

/**
 * Fresh shuffled turn order across all NUM_PLAYERS players. The caller can
 * supply a custom rng for determinism; defaults to Math.random.
 */
function freshTurnOrder(rng: () => number = Math.random): number[] {
  const order: number[] = [];
  for (let i = 0; i < NUM_PLAYERS; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
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
 * chosen is null (the policy passed) or if the policy returned a move not
 * in the legal set (shouldn't happen for well-behaved policies).
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
  return -1;
}

/**
 * Run one full headless game with the given per-seat policies and return
 * the outcome plus a complete decision log. Each turn the actor's policy
 * is invoked repeatedly until it returns null (pass) or hits the move cap;
 * then reinforcement runs and the next non-eliminated player goes.
 *
 * If the game tails out at maxRounds, the territory leader is declared
 * winner so every decision still gets a label.
 */
export function runOneGameWithPolicy(
  policies: Policy[],
  maxRounds: number = DEFAULT_MAX_ROUNDS,
  maxMovesPerTurn: number = DEFAULT_MAX_MOVES_PER_TURN,
): GameResultWithLog {
  let map = generateMap();
  const adjacency = encodeAdjacency(map);
  const bank = new Array<number>(NUM_PLAYERS).fill(0);
  const partials: Omit<DecisionRecord, "won">[] = [];

  const turnOrder = freshTurnOrder();

  let turnIdx = 0;
  let round = 0;
  let winner: number | null = null;
  let completed = false;

  outer: while (round < maxRounds) {
    const actor = turnOrder[turnIdx];

    if (!playerIsEliminated(map, actor)) {
      let movesThisTurn = 0;
      while (movesThisTurn++ < maxMovesPerTurn) {
        const legal = enumerateLegalAttacks(map, actor);
        if (legal.length === 0) break;
        const action = policies[actor](map, actor, round, adjacency);
        partials.push({
          playerId: actor,
          turnIndex: round,
          board: encodeBoard(map, actor, round),
          candidates: decorateCandidates(map, legal),
          chosenIdx: indexOfChosen(legal, action),
        });
        if (!action) break;
        const result = resolveAttack(map, action.sourceId, action.targetId);
        map = result.map;
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
    const counts = new Array<number>(NUM_PLAYERS).fill(0);
    for (const t of map.territories) counts[t.ownerId]++;
    let leader = 0;
    for (let i = 1; i < NUM_PLAYERS; i++) {
      if (counts[i] > counts[leader]) leader = i;
    }
    winner = leader;
  }

  const decisions: DecisionRecord[] = partials.map((d) => ({
    ...d,
    won: d.playerId === winner,
  }));

  return { winner, rounds: round, completed, adjacency, decisions };
}

/**
 * Build a Policy that uses the existing linear selectBestAttack with a
 * (possibly fixed) personality. Default: fresh random personality per
 * factory call.
 */
export function linearPolicy(
  personality: AIPersonality = makePersonality(),
): Policy {
  return (map, playerId) => selectBestAttack(map, playerId, personality);
}

/**
 * Build a Policy that uses the NN's greedy selectBestAttackModel. Reuses
 * the pre-encoded adjacency the self-play loop already holds.
 */
export function greedyNeuralPolicy(weights: ModelWeights): Policy {
  return (map, playerId, turnIndex, adjacency) =>
    selectBestAttackModel(map, playerId, weights, turnIndex, adjacency);
}

/**
 * Build a Policy that softmax-samples NN actions at temperature `temp`.
 * Used for exploration during self-play training.
 */
export function samplingNeuralPolicy(
  weights: ModelWeights,
  temp: number,
  rng: () => number = Math.random,
): Policy {
  return (map, playerId, turnIndex, adjacency) =>
    sampleAttackModel(map, playerId, weights, turnIndex, temp, rng, adjacency);
}
