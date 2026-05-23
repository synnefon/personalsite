import { winProbability, type AIMove } from "../ai.ts";
import {
  simulateAttackFail,
  simulateAttackSuccess,
  simulateReinforcement,
} from "../combat.ts";
import { MAX_DICE_PER_TERRITORY, NUM_PLAYERS } from "../constants.ts";
import { largestComponent, playerIsEliminated } from "../gameLogic.ts";
import type { GameMap } from "../types.ts";
import {
  encodeBoard,
  type EncodedAdjacency,
} from "./encoding.ts";
import { computeEmbeddings, scoreValue, type ModelWeights } from "./forward.ts";
import {
  ARCHETYPE_BEHAVIOR,
  ARCHETYPES,
  type ArchetypeId,
} from "./personalities.ts";

/**
 * Every legal attack move for `playerId` on the current board: each source
 * the player owns with >= 2 dice, paired with each adjacent enemy cell.
 */
export function enumerateLegalAttacks(
  map: GameMap,
  playerId: number,
): AIMove[] {
  const out: AIMove[] = [];
  for (let s = 0; s < map.territories.length; s++) {
    const source = map.territories[s];
    if (source.ownerId !== playerId) continue;
    if (source.dice < 2) continue;
    const neighbors = map.adjacency.get(s);
    if (!neighbors) continue;
    for (const tgt of neighbors) {
      if (map.territories[tgt].ownerId !== playerId) {
        out.push({ sourceId: s, targetId: tgt });
      }
    }
  }
  return out;
}

/**
 * Logit-domain V(s) for `playerId` on `map` at `turnIndex`. Encodes the
 * board from the actor's POV, runs the forward pass, returns the value
 * head's raw output. Higher = more likely to win.
 */
function valueOf(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
): number {
  const encoded = encodeBoard(map, playerId, turnIndex);
  const embeddings = computeEmbeddings(encoded, adjacency, weights);
  return scoreValue(embeddings, adjacency.numTerritories, weights);
}

/**
 * 1-ply expected-value Q for one candidate attack: simulate success and
 * failure outcomes, project each through end-of-turn reinforcement, then
 * value the resulting states and weight by attack success probability.
 *
 * The reinforcement projection is critical (thesis Eq 5.2): without it,
 * V(s_after_attack) differs from V(s_current) only by "one die lost from
 * source" — a tiny perturbation the value head can't distinguish, so the
 * policy collapses to pass. Projecting through reinforcement adds the
 * actor's `score` dice to the post-attack state, making the V comparison
 * reflect the actual turn-level delta.
 */
function qOfAttack(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  move: AIMove,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
): number {
  const wp = winProbability(
    map.territories[move.sourceId].dice,
    map.territories[move.targetId].dice,
  );
  const successMap = simulateReinforcement(
    simulateAttackSuccess(map, move.sourceId, move.targetId),
    playerId,
  );
  const failMap = simulateReinforcement(
    simulateAttackFail(map, move.sourceId, move.targetId),
    playerId,
  );
  const vSuccess = valueOf(successMap, playerId, turnIndex, adjacency, weights);
  const vFail = valueOf(failMap, playerId, turnIndex, adjacency, weights);
  return wp * vSuccess + (1 - wp) * vFail;
}

/**
 * V for the pass action: project through end-of-turn reinforcement on
 * the current board, then evaluate. Symmetric with qOfAttack — both
 * compare states *after* this seat's reinforcement, so the V differences
 * the policy sees are the real downstream consequence of acting vs not.
 */
function valueOfPass(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
): number {
  const reinforced = simulateReinforcement(map, playerId);
  return valueOf(reinforced, playerId, turnIndex, adjacency, weights);
}

export type CandidateScore = {
  /** null = the "pass" action. */
  move: AIMove | null;
  /** Expected V (logit domain) of the post-reinforcement state. */
  q: number;
};

/**
 * Score the pass action plus every legal attack from `playerId`. Pass is
 * `V(current state, after my reinforcement)`; attacks are `qOfAttack`.
 * Caller picks argmax for greedy play, or softmax-samples for stochastic
 * play.
 */
export function scoreAllActions(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
  legalMoves?: ReadonlyArray<AIMove>,
): CandidateScore[] {
  const moves = legalMoves ?? enumerateLegalAttacks(map, playerId);
  const out: CandidateScore[] = [];
  out.push({
    move: null,
    q: valueOfPass(map, playerId, turnIndex, adjacency, weights),
  });
  for (const m of moves) {
    out.push({
      move: m,
      q: qOfAttack(map, playerId, turnIndex, m, adjacency, weights),
    });
  }
  return out;
}

/** Count of players who still own at least one territory. */
function countAlivePlayers(map: GameMap): number {
  let alive = 0;
  for (let p = 0; p < NUM_PLAYERS; p++) {
    if (!playerIsEliminated(map, p)) alive++;
  }
  return alive;
}

/**
 * Required attack-vs-pass advantage for an attack to be taken (logit
 * units). Lerps from `THRESHOLD_MAX` (with all players alive) down to
 * `THRESHOLD_MIN` (with 2 players alive) as the game narrows.
 *
 * Tuned for archetype differentiation, not pure win rate. With the
 * trained model's Q-gap distribution (mean ≈ 0.26, std ≈ 0.26):
 *   0.4 → optimizer 30-40% attack (too passive — "super duper inactive")
 *   0.2 → optimizer 90% attack (basically same as berserker, no spread)
 *   0.3 → optimizer ~50-60% attack — visibly cautious without stalling
 *
 * Combined with the per-archetype multipliers in `personalities.ts`, this
 * gives a spread from berserker (effective ~0.10) → coward (effective
 * ~0.55), which is what makes the archetypes feel distinct in play.
 */
const THRESHOLD_MAX = 0.3;
const THRESHOLD_MIN = 0.1;
function decisionThreshold(map: GameMap): number {
  const alive = countAlivePlayers(map);
  if (alive <= 2) return THRESHOLD_MIN;
  const t =
    (alive - 2) / (NUM_PLAYERS - 2); // 0 at 2 players, 1 at NUM_PLAYERS
  return THRESHOLD_MIN + (THRESHOLD_MAX - THRESHOLD_MIN) * t;
}

/**
 * True iff every territory `playerId` owns is at MAX_DICE_PER_TERRITORY.
 * In that state, end-of-turn reinforcement has nowhere to land — every
 * generated die goes into the bank and accumulates indefinitely. Real
 * overflow case (vs. the thesis's stricter "any 8-die source" framing,
 * which doesn't actually waste reinforcement since other territories
 * absorb the scatter).
 */
function allOwnedAtMax(map: GameMap, playerId: number): boolean {
  let owned = 0;
  for (const t of map.territories) {
    if (t.ownerId !== playerId) continue;
    owned++;
    if (t.dice < MAX_DICE_PER_TERRITORY) return false;
  }
  return owned > 0;
}

/**
 * Greedy value-network policy:
 *
 *   1. Score pass and every legal attack via 1-ply expected V (each Q
 *      projects through the actor's end-of-turn reinforcement, see
 *      qOfAttack / valueOfPass).
 *   2. If `bestAttackQ − passQ > threshold(state)`, take it. The
 *      threshold lerps from `THRESHOLD_MAX` (many players alive) to
 *      `THRESHOLD_MIN` (2 players left) — selective in opening, less so
 *      in endgame.
 *   3. Bank-overflow override: if every owned territory is at 8 dice,
 *      attack anyway (best move). This is the *real* wasted-reinforcement
 *      case — without it, dice generated end-of-turn pile up uselessly
 *      in the bank. Triggers rarely (full consolidation only) and
 *      complements the turtle preference of the threshold ramp.
 *   4. Otherwise, pass.
 *
 * Departs from the thesis's "any 8-die source" override (STE §5.3) and
 * "best move's source is 8" variant (WPM-S Algorithm 1); both were
 * stall-prevention hacks that fight against turtle play. The
 * all-maxed variant is principled (real mechanical overflow case) and
 * rare (triggers only when you've already won the consolidation race).
 */
export function selectBestAttackByValue(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
  legalMoves?: ReadonlyArray<AIMove>,
): AIMove | null {
  const moves = legalMoves ?? enumerateLegalAttacks(map, playerId);
  if (moves.length === 0) return null;

  const passQ = valueOfPass(map, playerId, turnIndex, adjacency, weights);

  let bestMove: AIMove | null = null;
  let bestQ = -Infinity;
  for (const m of moves) {
    const q = qOfAttack(map, playerId, turnIndex, m, adjacency, weights);
    if (q > bestQ) {
      bestQ = q;
      bestMove = m;
    }
  }

  const threshold = decisionThreshold(map);
  if (bestMove !== null && bestQ - passQ > threshold) return bestMove;
  if (bestMove !== null && allOwnedAtMax(map, playerId)) return bestMove;
  return null;
}

/**
 * Softmax-sampled value-network policy: same per-action Q values as the
 * greedy variant (including reinforcement projection), but sample over
 * them at temperature `temp`. Used for the "Chaos" archetype at
 * inference. Skips the threshold + 8-die override — sampling already
 * provides the variance, and overriding would clash with the random
 * draw.
 */
export function sampleAttackByValue(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
  temp: number,
  rng: () => number = Math.random,
  legalMoves?: ReadonlyArray<AIMove>,
): AIMove | null {
  const scored = scoreAllActions(
    map,
    playerId,
    turnIndex,
    adjacency,
    weights,
    legalMoves,
  );

  let maxQ = -Infinity;
  for (const c of scored) if (c.q > maxQ) maxQ = c.q;
  const safeTemp = Math.max(temp, 1e-6);
  let sum = 0;
  const exps: number[] = [];
  for (const c of scored) {
    const e = Math.exp((c.q - maxQ) / safeTemp);
    exps.push(e);
    sum += e;
  }
  let r = rng() * sum;
  for (let i = 0; i < exps.length; i++) {
    r -= exps[i];
    if (r <= 0) return scored[i].move;
  }
  return scored[scored.length - 1].move;
}

// ===== Archetype-aware decision rule (browser inference only) =============
//
// Layer per-archetype decision modifiers on top of the V-network's Q values.
// Each archetype expressed as:
//   - threshold multiplier (from ARCHETYPE_BEHAVIOR) — scales the base
//     attack-vs-pass gap required to attack
//   - per-candidate Q bias (computed below from game-state features)
//   - optional softmax sampling (Chaos)
// Magnitudes calibrated from the empirical Q-gap distribution; see
// personalities.ts comments and calibrate.ts output.

/**
 * Probability the actor keeps the captured territory through opponents'
 * next turn — product over enemy neighbors of (1 − their P of winning
 * back). Matches the thesis's STEi hold-probability formula (Eq 5.1).
 */
function captureHoldProb(
  map: GameMap,
  targetId: number,
  playerId: number,
): number {
  const t = map.territories[targetId];
  const neighbors = map.adjacency.get(targetId);
  if (!neighbors) return 1;
  let p = 1;
  for (const n of neighbors) {
    const nT = map.territories[n];
    if (nT.ownerId === playerId) continue;
    p *= 1 - winProbability(nT.dice, t.dice);
  }
  return p;
}

type BiasContext = {
  winProb: number;
  deltaLargest: number;
  holdProb: number;
  targetOwner: number;
  /** 0 = weakest alive enemy, maxRank = strongest. */
  targetRank: number;
  /** Largest possible value of targetRank for this state. */
  maxRank: number;
  /** Opponents who recently captured one of `playerId`'s territories. */
  recentAttackers: ReadonlySet<number>;
};

function archetypeBias(arch: ArchetypeId, ctx: BiasContext): number {
  switch (arch) {
    case ARCHETYPES.berserker:
      return 0.1 * ctx.winProb;
    case ARCHETYPES.builder:
      return 0.1 * ctx.deltaLargest;
    case ARCHETYPES.coward:
      return 0.1 * ctx.holdProb;
    case ARCHETYPES.kingmaker:
      // Linear map: rank=0 (weakest) → -0.15; rank=maxRank (strongest) → +0.15.
      return ctx.maxRank > 0
        ? 0.15 * ((2 * ctx.targetRank) / ctx.maxRank - 1)
        : 0;
    case ARCHETYPES.vengeful:
      return ctx.recentAttackers.has(ctx.targetOwner) ? 0.15 : 0;
    case ARCHETYPES.optimizer:
    case ARCHETYPES.chaos:
      return 0;
  }
}

/**
 * Archetype-aware decision rule. Computes V-network Q for each candidate
 * (with reinforcement projection, identical to selectBestAttackByValue),
 * then adds the archetype's per-candidate bias, and decides via either
 * threshold-with-override (greedy archetypes) or softmax sampling (Chaos).
 */
export function selectBestAttackForArchetype(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
  archetype: ArchetypeId,
  recentAttackers: ReadonlySet<number>,
  rng: () => number = Math.random,
  legalMoves?: ReadonlyArray<AIMove>,
): AIMove | null {
  const moves = legalMoves ?? enumerateLegalAttacks(map, playerId);
  if (moves.length === 0) return null;

  const behavior = ARCHETYPE_BEHAVIOR[archetype];
  const passQ = valueOfPass(map, playerId, turnIndex, adjacency, weights);

  // Rank alive enemies by score (low → high), for kingmaker bias.
  const playerScores: number[] = [];
  for (let p = 0; p < NUM_PLAYERS; p++) {
    playerScores.push(playerIsEliminated(map, p) ? -1 : largestComponent(map, p));
  }
  const aliveEnemies: number[] = [];
  for (let p = 0; p < NUM_PLAYERS; p++) {
    if (p !== playerId && !playerIsEliminated(map, p)) aliveEnemies.push(p);
  }
  aliveEnemies.sort((a, b) => playerScores[a] - playerScores[b]);
  const rankFromLow = new Map<number, number>();
  aliveEnemies.forEach((p, idx) => rankFromLow.set(p, idx));
  const maxRank = Math.max(1, aliveEnemies.length - 1);

  const myLargestPre = largestComponent(map, playerId);

  type Scored = { move: AIMove; q: number };
  const scored: Scored[] = [];
  for (const m of moves) {
    const baseQ = qOfAttack(map, playerId, turnIndex, m, adjacency, weights);
    const winProb = winProbability(
      map.territories[m.sourceId].dice,
      map.territories[m.targetId].dice,
    );
    const successMap = simulateAttackSuccess(map, m.sourceId, m.targetId);
    const deltaLargest = largestComponent(successMap, playerId) - myLargestPre;
    const holdProb = captureHoldProb(successMap, m.targetId, playerId);
    const targetOwner = map.territories[m.targetId].ownerId;
    const targetRank = rankFromLow.get(targetOwner) ?? 0;
    const bias = archetypeBias(archetype, {
      winProb,
      deltaLargest,
      holdProb,
      targetOwner,
      targetRank,
      maxRank,
      recentAttackers,
    });
    scored.push({ move: m, q: baseQ + bias });
  }

  // Chaos: softmax-sample over biased Qs including pass.
  if (behavior.samplingTemp > 0) {
    const all: { move: AIMove | null; q: number }[] = [
      { move: null, q: passQ },
      ...scored,
    ];
    let maxQ = -Infinity;
    for (const a of all) if (a.q > maxQ) maxQ = a.q;
    const safeTemp = Math.max(behavior.samplingTemp, 1e-6);
    let sum = 0;
    const exps: number[] = [];
    for (const a of all) {
      const e = Math.exp((a.q - maxQ) / safeTemp);
      exps.push(e);
      sum += e;
    }
    let r = rng() * sum;
    for (let i = 0; i < exps.length; i++) {
      r -= exps[i];
      if (r <= 0) return all[i].move;
    }
    return all[all.length - 1].move;
  }

  // Greedy with archetype-scaled threshold + all-cells-at-8 override.
  let bestMove: AIMove | null = null;
  let bestQ = -Infinity;
  for (const s of scored) {
    if (s.q > bestQ) {
      bestQ = s.q;
      bestMove = s.move;
    }
  }
  const threshold = decisionThreshold(map) * behavior.thresholdMultiplier;
  if (bestMove !== null && bestQ - passQ > threshold) return bestMove;
  if (bestMove !== null && allOwnedAtMax(map, playerId)) return bestMove;
  return null;
}
