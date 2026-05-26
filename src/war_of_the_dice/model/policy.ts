import {
  simulateAttackFail,
  simulateAttackSuccess,
  simulateReinforcement,
} from "../combat.ts";
import { MAX_DICE_PER_TERRITORY, NUM_PLAYERS } from "../constants.ts";
import { winProbability } from "../diceMath.ts";
import { largestComponent, playerIsEliminated } from "../gameLogic.ts";
import type { AttackMove, GameMap } from "../types.ts";
import { encodeBoard, type EncodedAdjacency } from "./encoding.ts";
import { computeEmbeddings, scoreValue, type ModelWeights } from "./forward.ts";
import {
  ARCHETYPE_BEHAVIOR,
  type ArchetypeId,
  type BiasValue,
} from "./personalities.ts";

/**
 * Every legal attack move for `playerId` on the current board: each source
 * the player owns with >= 2 dice, paired with each adjacent enemy cell.
 */
export function enumerateLegalAttacks(
  map: GameMap,
  playerId: number,
): AttackMove[] {
  const out: AttackMove[] = [];
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
 * Per-turn memo of value-network outputs. Within a single actor's turn,
 * `playerId` and `turnIndex` are invariant — only the board changes. The
 * cache key encodes the territory ownership + dice configuration; same
 * board → same V → skip the forward pass.
 *
 * Owner: the policy caller. Construct with `makeValueCache()` and discard
 * at every turn boundary; stale entries (different actor / different
 * turn) would return wrong values.
 *
 * Tracks `hits` / `misses` so callers can verify the hit rate empirically.
 */
export type ValueCache = {
  entries: Map<string, number>;
  hits: number;
  misses: number;
};

export function makeValueCache(): ValueCache {
  return { entries: new Map(), hits: 0, misses: 0 };
}

/** Pack (ownerId, dice) into a single integer per territory and join.
 *  Compact enough to be fast to compute and hash via Map's internal
 *  string interning. */
function boardCacheKey(map: GameMap): string {
  const parts = new Array<number>(map.territories.length);
  for (let i = 0; i < map.territories.length; i++) {
    const t = map.territories[i];
    parts[i] = t.ownerId * 16 + t.dice;
  }
  return parts.join(",");
}

/**
 * Logit-domain V(s) for `playerId` on `map` at `turnIndex`. Encodes the
 * board from the actor's POV, runs the forward pass, returns the value
 * head's raw output. Higher = more likely to win. Optionally memoized
 * by `cache` — same board → same V within a turn.
 */
export function valueOf(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
  cache?: ValueCache,
): number {
  if (cache) {
    const key = boardCacheKey(map);
    const hit = cache.entries.get(key);
    if (hit !== undefined) {
      cache.hits++;
      return hit;
    }
    cache.misses++;
    const encoded = encodeBoard(map, playerId, turnIndex);
    const embeddings = computeEmbeddings(encoded, adjacency, weights);
    const v = scoreValue(embeddings, adjacency.numTerritories, weights);
    cache.entries.set(key, v);
    return v;
  }
  const encoded = encodeBoard(map, playerId, turnIndex);
  const embeddings = computeEmbeddings(encoded, adjacency, weights);
  return scoreValue(embeddings, adjacency.numTerritories, weights);
}

/**
 * Inside the recursive lookahead, only consider the top-K candidate
 * attacks at each non-root level (ranked by win probability — a cheap
 * proxy for "promising"). The outer decision still considers all moves;
 * this caps the branching factor of the inner expectimax tree.
 *
 * Depth 3 with N=10 unpruned: ~8000 leaf V-evals (~400ms). With K=4:
 * ~1280 leaf evals (~64ms). Quality tradeoff is small because the
 * pruned-away moves had low winProb — they were unlikely to be the best
 * continuation anyway.
 */
const INNER_BRANCHING_LIMIT = 4;

/**
 * Optimal end-of-turn value reachable from `map` with up to `remainingDepth`
 * more decisions. Recursive expectimax over my decisions (max over pass +
 * legal attacks) and chance over attack outcomes (success/fail weighted by
 * win probability).
 *
 * At depth 0 (or no legal moves), returns `V(map after my reinforcement)`
 * — i.e., "if I pass now, end the turn, what's V". For attacks at deeper
 * levels, reinforcement is applied at the depth-0 leaf, so each branch
 * represents a true end-of-turn evaluation.
 *
 * "Greedy" because inner branches argmax over actions; doesn't respect
 * archetype-specific decision modifiers. The inner branching is pruned
 * to the top-`INNER_BRANCHING_LIMIT` candidates by win probability to
 * keep depth 3 tractable.
 */
function expectedTurnValueGreedy(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  remainingDepth: number,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
  cache?: ValueCache,
): number {
  // Pass-now value: end the turn after this seat's reinforcement.
  const passV = valueOf(
    simulateReinforcement(map, playerId),
    playerId,
    turnIndex,
    adjacency,
    weights,
    cache,
  );

  if (remainingDepth <= 0) return passV;
  const legal = enumerateLegalAttacks(map, playerId);
  if (legal.length === 0) return passV;

  // Score each candidate by winProb (cheap) and keep only the top-K.
  // Trades a small chance of missing a low-winProb-but-positional gem for
  // ~6× speedup at depth 3.
  const scored = legal.map((m) => ({
    m,
    wp: winProbability(
      map.territories[m.sourceId].dice,
      map.territories[m.targetId].dice,
    ),
  }));
  scored.sort((a, b) => b.wp - a.wp);
  const candidates = scored.slice(0, INNER_BRANCHING_LIMIT);

  let best = passV;
  for (const { m, wp } of candidates) {
    const sMap = simulateAttackSuccess(map, m.sourceId, m.targetId);
    const fMap = simulateAttackFail(map, m.sourceId, m.targetId);
    const vS = expectedTurnValueGreedy(
      sMap,
      playerId,
      turnIndex,
      remainingDepth - 1,
      adjacency,
      weights,
      cache,
    );
    const vF = expectedTurnValueGreedy(
      fMap,
      playerId,
      turnIndex,
      remainingDepth - 1,
      adjacency,
      weights,
      cache,
    );
    const q = wp * vS + (1 - wp) * vF;
    if (q > best) best = q;
  }
  return best;
}

/**
 * Expected-value Q for one candidate attack at this turn-step, with
 * `remainingDepth` additional decisions explored after this one.
 *
 * The reinforcement projection inside the recursion is critical (thesis
 * Eq 5.2): without it, V(s_after_attack) differs from V(s_current) only
 * by "one die lost from source" — a tiny perturbation the value head
 * can't distinguish, so the policy collapses to pass.
 *
 * remainingDepth=0 → "this attack is the last move of the turn" (the
 * original 1-ply behavior). remainingDepth=1 → "after this attack I
 * might consider one more", etc.
 */
function qOfAttack(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  move: AttackMove,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
  remainingDepth: number,
  cache?: ValueCache,
): number {
  const wp = winProbability(
    map.territories[move.sourceId].dice,
    map.territories[move.targetId].dice,
  );
  const sMap = simulateAttackSuccess(map, move.sourceId, move.targetId);
  const fMap = simulateAttackFail(map, move.sourceId, move.targetId);
  const vSuccess = expectedTurnValueGreedy(
    sMap,
    playerId,
    turnIndex,
    remainingDepth,
    adjacency,
    weights,
    cache,
  );
  const vFail = expectedTurnValueGreedy(
    fMap,
    playerId,
    turnIndex,
    remainingDepth,
    adjacency,
    weights,
    cache,
  );
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
  cache?: ValueCache,
): number {
  const reinforced = simulateReinforcement(map, playerId);
  return valueOf(reinforced, playerId, turnIndex, adjacency, weights, cache);
}

export type CandidateScore = {
  /** null = the "pass" action. */
  move: AttackMove | null;
  /** Expected V (logit domain) of the post-reinforcement state. */
  q: number;
};

/**
 * Score the pass action plus every legal attack from `playerId`. Pass is
 * `V(current state, after my reinforcement)`; attacks are `qOfAttack` with
 * `remainingDepth` more moves looked ahead (0 = original 1-ply behavior).
 * Caller picks argmax for greedy play, or softmax-samples for stochastic
 * play.
 */
export function scoreAllActions(
  map: GameMap,
  playerId: number,
  turnIndex: number,
  adjacency: EncodedAdjacency,
  weights: ModelWeights,
  legalMoves?: ReadonlyArray<AttackMove>,
  remainingDepth = 0,
  cache?: ValueCache,
): CandidateScore[] {
  const moves = legalMoves ?? enumerateLegalAttacks(map, playerId);
  const out: CandidateScore[] = [];
  out.push({
    move: null,
    q: valueOfPass(map, playerId, turnIndex, adjacency, weights, cache),
  });
  for (const m of moves) {
    out.push({
      move: m,
      q: qOfAttack(
        map,
        playerId,
        turnIndex,
        m,
        adjacency,
        weights,
        remainingDepth,
        cache,
      ),
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
 * Combined with the per-archetype multipliers in `personalities.ts`, this
 * gives a spread from conqueror (effective ~0.10) → lurker (effective
 * ~0.55), which is what makes the archetypes feel distinct in play.
 */
const THRESHOLD_MAX = 0.15;
const THRESHOLD_MIN = 0.1;
function decisionThreshold(map: GameMap): number {
  const alive = countAlivePlayers(map);
  if (alive <= 2) return THRESHOLD_MIN;
  const t = (alive - 2) / (NUM_PLAYERS - 2); // 0 at 2 players, 1 at NUM_PLAYERS
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
  legalMoves?: ReadonlyArray<AttackMove>,
  remainingDepth = 0,
  cache?: ValueCache,
): AttackMove | null {
  const moves = legalMoves ?? enumerateLegalAttacks(map, playerId);
  if (moves.length === 0) return null;

  const passQ = valueOfPass(
    map,
    playerId,
    turnIndex,
    adjacency,
    weights,
    cache,
  );

  let bestMove: AttackMove | null = null;
  let bestQ = -Infinity;
  for (const m of moves) {
    const q = qOfAttack(
      map,
      playerId,
      turnIndex,
      m,
      adjacency,
      weights,
      remainingDepth,
      cache,
    );
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
  legalMoves?: ReadonlyArray<AttackMove>,
  remainingDepth = 0,
  cache?: ValueCache,
): AttackMove | null {
  const scored = scoreAllActions(
    map,
    playerId,
    turnIndex,
    adjacency,
    weights,
    legalMoves,
    remainingDepth,
    cache,
  );
  return softmaxSample(scored, (c) => c.q, temp, rng).move;
}

/**
 * Softmax-sample one item from `items` according to `q(item)` at temperature
 * `temp`. `temp` floored at 1e-6 to avoid div-by-zero with a hard argmax
 * input. Numerically stable (subtracts the max Q before exponentiating).
 */
function softmaxSample<T>(
  items: ReadonlyArray<T>,
  q: (item: T) => number,
  temp: number,
  rng: () => number,
): T {
  const qs = items.map(q);
  let maxQ = -Infinity;
  for (const v of qs) if (v > maxQ) maxQ = v;
  const safeTemp = Math.max(temp, 1e-6);
  let sum = 0;
  const exps: number[] = [];
  for (const v of qs) {
    const e = Math.exp((v - maxQ) / safeTemp);
    exps.push(e);
    sum += e;
  }
  let r = rng() * sum;
  for (let i = 0; i < exps.length; i++) {
    r -= exps[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
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
 * Count of edges where `playerId` borders a non-`playerId` territory.
 * Used by the consolidator archetype to reward attacks that shrink the
 * actor's exposed perimeter.
 */
function frontierEdgesForActor(map: GameMap, playerId: number): number {
  let count = 0;
  for (let i = 0; i < map.territories.length; i++) {
    if (map.territories[i].ownerId !== playerId) continue;
    const neighbors = map.adjacency.get(i);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (map.territories[n].ownerId !== playerId) count++;
    }
  }
  return count;
}

/**
 * Probability the actor keeps the captured territory through opponents'
 * next turn — product over enemy neighbors of (1 − their P of winning
 * back). Matches the thesis's STEi hold-probability formula (Eq 5.1).
 */
export function captureHoldProb(
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

/**
 * Rank alive enemy players by largest-component score, low → high. Returns
 * a per-player score array (eliminated → -1), and a Map from each alive
 * enemy's ID to its rank (0 = weakest alive enemy). `maxRank` is the
 * largest possible rank value (`max(1, aliveEnemies.length - 1)`).
 *
 * Used for kingmaker / predator bias signals (and matched in calibrate.ts).
 */
export function rankAliveEnemies(
  map: GameMap,
  playerId: number,
): {
  playerScores: number[];
  rankFromLow: Map<number, number>;
  maxRank: number;
} {
  const playerScores: number[] = [];
  for (let p = 0; p < NUM_PLAYERS; p++) {
    playerScores.push(
      playerIsEliminated(map, p) ? -1 : largestComponent(map, p),
    );
  }
  const aliveEnemies: number[] = [];
  for (let p = 0; p < NUM_PLAYERS; p++) {
    if (p !== playerId && !playerIsEliminated(map, p)) aliveEnemies.push(p);
  }
  aliveEnemies.sort((a, b) => playerScores[a] - playerScores[b]);
  const rankFromLow = new Map<number, number>();
  aliveEnemies.forEach((p, idx) => rankFromLow.set(p, idx));
  const maxRank = Math.max(1, aliveEnemies.length - 1);
  return { playerScores, rankFromLow, maxRank };
}

type BiasContext = {
  winProb: number;
  deltaLargest: number;
  holdProb: number;
  /** Decrease in target owner's largest-component on attack success.
   *  Non-negative; rewards attacks that fracture their reinforcement
   *  income. */
  enemyLargestShrink: number;
  /** Decrease in *actor's own* frontier-edge count on attack success.
   *  Positive = consolidating (border length shrinks); negative = capture
   *  added more frontier than it absorbed. Range typically [-3, +3]. */
  frontierShrink: number;
  /** 0 = weakest alive enemy, maxRank = strongest. */
  targetRank: number;
  /** Largest possible value of targetRank for this state. */
  maxRank: number;
};

/**
 * Apply the archetype's declarative bias coefficients (from
 * `ARCHETYPE_BEHAVIOR[arch].biases`) to a per-candidate context. Each
 * non-zero coefficient adds a normalized contribution; missing fields
 * default to zero. Calibration / tuning happens by editing the table in
 * `personalities.ts`, not this function.
 */
function archetypeBias(arch: ArchetypeId, ctx: BiasContext): number {
  const biases = ARCHETYPE_BEHAVIOR[arch].biases;
  if (!biases) return 0;
  let total = 0;
  // Apply each bias: contribution is `coeff × signal`, optionally also
  // multiplied by winProb if `wpGated` is true.
  const apply = (b: BiasValue | undefined, signal: number): void => {
    if (!b) return;
    const gate = b.wpGated ? ctx.winProb : 1;
    total += b.coeff * gate * signal;
  };

  apply(biases.growthDrive, ctx.deltaLargest);
  apply(biases.holdDrive, ctx.holdProb);
  apply(biases.enemyHarmDrive, ctx.enemyLargestShrink);
  apply(biases.exposureFear, ctx.frontierShrink);
  if (ctx.maxRank > 0) {
    // Rank signal: +1 at weakest alive enemy, -1 at strongest. Positive
    // `preyOnWeak` rewards attacking the weak; negative rewards
    // challenging the leader (kingmaker behavior).
    const rankSignal = 1 - (2 * ctx.targetRank) / ctx.maxRank;
    apply(biases.preyOnWeak, rankSignal);
  }
  return total;
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
  rng: () => number = Math.random,
  legalMoves?: ReadonlyArray<AttackMove>,
  cache?: ValueCache,
): AttackMove | null {
  const moves = legalMoves ?? enumerateLegalAttacks(map, playerId);
  if (moves.length === 0) return null;

  const behavior = ARCHETYPE_BEHAVIOR[archetype];
  const passQ = valueOfPass(
    map,
    playerId,
    turnIndex,
    adjacency,
    weights,
    cache,
  );

  const { playerScores, rankFromLow, maxRank } = rankAliveEnemies(
    map,
    playerId,
  );

  const myLargestPre = largestComponent(map, playerId);
  const myFrontierPre = frontierEdgesForActor(map, playerId);

  // Lookahead depth comes from the archetype's behavior. The base Q for
  // each candidate is "this attack's expected value, played out optimally
  // for the remaining `lookaheadDepth - 1` decisions of this turn".
  const remainingDepth = Math.max(0, behavior.lookaheadDepth - 1);

  type Scored = { move: AttackMove; q: number };
  const scored: Scored[] = [];
  for (const m of moves) {
    const baseQ = qOfAttack(
      map,
      playerId,
      turnIndex,
      m,
      adjacency,
      weights,
      remainingDepth,
      cache,
    );
    const winProb = winProbability(
      map.territories[m.sourceId].dice,
      map.territories[m.targetId].dice,
    );
    const successMap = simulateAttackSuccess(map, m.sourceId, m.targetId);
    const deltaLargest = largestComponent(successMap, playerId) - myLargestPre;
    const holdProb = captureHoldProb(successMap, m.targetId, playerId);
    const targetOwner = map.territories[m.targetId].ownerId;
    const targetRank = rankFromLow.get(targetOwner) ?? 0;
    // Pre-attack largest for the defender came from playerScores (eliminated
    // players show -1 there, but anyone owning the target is alive). Post-
    // attack we recompute on successMap. Shrinkage = pre − post, ≥ 0.
    const targetOwnerPre = Math.max(0, playerScores[targetOwner]);
    const targetOwnerPost = largestComponent(successMap, targetOwner);
    const enemyLargestShrink = Math.max(0, targetOwnerPre - targetOwnerPost);
    const myFrontierPost = frontierEdgesForActor(successMap, playerId);
    const frontierShrink = myFrontierPre - myFrontierPost;
    const bias = archetypeBias(archetype, {
      winProb,
      deltaLargest,
      holdProb,
      enemyLargestShrink,
      frontierShrink,
      targetRank,
      maxRank,
    });
    scored.push({ move: m, q: baseQ + bias });
  }

  // Chaos: softmax-sample over biased Qs including pass.
  if (behavior.samplingTemp > 0) {
    const all: { move: AttackMove | null; q: number }[] = [
      { move: null, q: passQ },
      ...scored,
    ];
    return softmaxSample(all, (a) => a.q, behavior.samplingTemp, rng).move;
  }

  // Greedy with archetype-scaled threshold + all-cells-at-8 override.
  let bestMove: AttackMove | null = null;
  let bestQ = -Infinity;
  for (const s of scored) {
    if (s.q > bestQ) {
      bestQ = s.q;
      bestMove = s.move;
    }
  }
  const threshold = decisionThreshold(map) * behavior.attackFear;
  if (bestMove !== null && bestQ - passQ > threshold) return bestMove;
  if (bestMove !== null && allOwnedAtMax(map, playerId)) return bestMove;
  return null;
}
