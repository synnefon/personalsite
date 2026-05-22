import {
  COLS,
  LAKE_COUNT_MAX,
  LAKE_COUNT_MIN,
  MAX_DICE_PER_TERRITORY,
  MAX_GENERATION_ATTEMPTS,
  MAX_LAKE_HEXES,
  MAX_TERRITORY_HEXES,
  MIN_LAKE_HEXES,
  MIN_PLAYABLE_HEXES,
  MIN_SEED_DISTANCE,
  MIN_TERRITORY_HEXES,
  NUM_PLAYERS,
  NUM_TERRITORIES,
  ROWS,
  STARTING_DICE_PER_PLAYER,
  VOID_PROB_BY_DISTANCE,
} from "./constants.ts";
import { hexAllNeighbors, hexDistance, hexKey } from "./hexGeometry.ts";
import type { GameMap, Hex, HexCoord, Territory } from "./types.ts";

type Rng = () => number;

/** Leftmost axial q for row `r` in the offset rectangular grid. */
function rectQStart(r: number): number {
  return -Math.floor(r / 2);
}

/** True iff (q, r) is inside the COLS × ROWS rectangular grid. */
function isInRectangle(q: number, r: number): boolean {
  if (r < 0 || r >= ROWS) return false;
  const qStart = rectQStart(r);
  return q >= qStart && q < qStart + COLS;
}

/** True iff (q, r) lies on the perimeter of the COLS × ROWS rectangle. */
function isOnRectangleBoundary(q: number, r: number): boolean {
  if (!isInRectangle(q, r)) return false;
  if (r === 0 || r === ROWS - 1) return true;
  const qStart = rectQStart(r);
  return q === qStart || q === qStart + COLS - 1;
}

/** Build the full COLS × ROWS rectangular hex grid with no territories assigned. */
function buildEmptyGrid(): Map<string, Hex> {
  const hexes = new Map<string, Hex>();
  for (let r = 0; r < ROWS; r++) {
    const qStart = rectQStart(r);
    for (let q = qStart; q < qStart + COLS; q++) {
      hexes.set(hexKey(q, r), { q, r, territoryId: -1 });
    }
  }
  return hexes;
}

/** Return a Fisher–Yates shuffle of `arr`; input is not mutated. */
function shuffle<T>(arr: ReadonlyArray<T>, rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Neighbors of `hex` that actually exist in `hexes` (off-grid / voided ones omitted). */
function existingNeighbors(hex: HexCoord, hexes: Map<string, Hex>): Hex[] {
  const out: Hex[] = [];
  for (const n of hexAllNeighbors(hex)) {
    const h = hexes.get(hexKey(n.q, n.r));
    if (h) out.push(h);
  }
  return out;
}

/** Distance (in hex steps) from each hex to the nearest grid boundary. */
function distanceFromBoundary(hexes: Map<string, Hex>): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const [k, h] of hexes) {
    let interior = true;
    for (const n of hexAllNeighbors(h)) {
      if (!hexes.has(hexKey(n.q, n.r))) {
        interior = false;
        break;
      }
    }
    if (!interior) {
      dist.set(k, 0);
      queue.push(k);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const k = queue[head++];
    const d = dist.get(k);
    if (d === undefined) continue;
    const cur = hexes.get(k);
    if (!cur) continue;
    for (const n of hexAllNeighbors(cur)) {
      const nk = hexKey(n.q, n.r);
      if (hexes.has(nk) && !dist.has(nk)) {
        dist.set(nk, d + 1);
        queue.push(nk);
      }
    }
  }
  return dist;
}

/**
 * Randomly delete hexes with probability that depends on distance from the
 * boundary, chewing the outer rectangle into an irregular blob (see
 * VOID_PROB_BY_DISTANCE).
 */
function punchVoids(hexes: Map<string, Hex>, rng: Rng): void {
  const dist = distanceFromBoundary(hexes);
  const lastIdx = VOID_PROB_BY_DISTANCE.length - 1;
  const toDelete: string[] = [];
  for (const [k] of hexes) {
    const d = dist.get(k) ?? 0;
    const p = VOID_PROB_BY_DISTANCE[Math.min(d, lastIdx)];
    if (rng() < p) toDelete.push(k);
  }
  for (const k of toDelete) hexes.delete(k);
}

/** Prune `hexes` down to its largest connected component (in place). */
function keepLargestComponent(hexes: Map<string, Hex>): void {
  const visited = new Set<string>();
  let best = new Set<string>();
  for (const [startKey] of hexes) {
    if (visited.has(startKey)) continue;
    const comp = new Set<string>();
    const queue: string[] = [startKey];
    visited.add(startKey);
    comp.add(startKey);
    let head = 0;
    while (head < queue.length) {
      const k = queue[head++];
      const cur = hexes.get(k);
      if (!cur) continue;
      for (const n of hexAllNeighbors(cur)) {
        const nk = hexKey(n.q, n.r);
        if (!hexes.has(nk) || visited.has(nk)) continue;
        visited.add(nk);
        comp.add(nk);
        queue.push(nk);
      }
    }
    if (comp.size > best.size) best = comp;
  }
  for (const k of [...hexes.keys()]) {
    if (!best.has(k)) hexes.delete(k);
  }
}

/**
 * Greedy min-distance seed placement: shuffle candidates, take the first hex
 * that's at least MIN_SEED_DISTANCE from every previously-placed seed. May
 * return fewer than `count` if the playable area is too cramped (caller
 * retries the whole generation).
 */
function placeSeeds(
  hexes: Map<string, Hex>,
  count: number,
  rng: Rng
): Hex[] {
  const candidates = shuffle([...hexes.values()], rng);
  const placed: Hex[] = [];
  for (const candidate of candidates) {
    let ok = true;
    for (const p of placed) {
      if (hexDistance(candidate, p) < MIN_SEED_DISTANCE) {
        ok = false;
        break;
      }
    }
    if (ok) {
      placed.push(candidate);
      if (placed.length === count) return placed;
    }
  }
  return placed;
}

/**
 * Place NUM_TERRITORIES seed hexes (min-distance apart), then flood-fill
 * the territory ID outward in strict round-robin order so no territory
 * gets a permanent first-pick advantage on contested hexes. Returns false
 * if seed placement fails or any hex stays unclaimed.
 */
function assignTerritories(hexes: Map<string, Hex>, rng: Rng): boolean {
  if (hexes.size < NUM_TERRITORIES) return false;
  const seeds = placeSeeds(hexes, NUM_TERRITORIES, rng);
  if (seeds.length < NUM_TERRITORIES) return false;
  seeds.forEach((h, i) => {
    h.territoryId = i;
  });

  const frontiers: Set<string>[] = seeds.map(() => new Set<string>());
  for (let i = 0; i < seeds.length; i++) {
    for (const n of existingNeighbors(seeds[i], hexes)) {
      if (n.territoryId === -1) frontiers[i].add(hexKey(n.q, n.r));
    }
  }

  // Strict round-robin: every territory with a non-empty frontier claims
  // exactly one hex per round. Order is reshuffled each round so no
  // territory gets a permanent first-pick advantage on contested hexes.
  let claimed = NUM_TERRITORIES;
  const total = hexes.size;
  const ids = Array.from({ length: NUM_TERRITORIES }, (_, i) => i);
  while (claimed < total) {
    let grewSomething = false;
    const order = shuffle(ids, rng);
    for (const t of order) {
      const frontier = frontiers[t];
      if (frontier.size === 0) continue;
      const frontierArr = [...frontier];
      const k = frontierArr[Math.floor(rng() * frontierArr.length)];
      const chosen = hexes.get(k);
      if (!chosen) {
        frontier.delete(k);
        continue;
      }
      chosen.territoryId = t;
      claimed++;
      grewSomething = true;
      for (const f of frontiers) f.delete(k);
      for (const n of existingNeighbors(chosen, hexes)) {
        if (n.territoryId === -1) frontier.add(hexKey(n.q, n.r));
      }
      if (claimed === total) break;
    }
    if (!grewSomething) break;
  }
  return claimed === total;
}

/**
 * Every player starts with exactly STARTING_DICE_PER_PLAYER dice. Each of
 * the player's territories receives 1 die, then the remainder is scattered
 * randomly across them (respecting MAX_DICE_PER_TERRITORY).
 */
function assignDice(territories: Territory[], rng: Rng): void {
  for (const t of territories) t.dice = 1;

  const byOwner: number[][] = Array.from({ length: NUM_PLAYERS }, () => []);
  for (const t of territories) byOwner[t.ownerId].push(t.id);

  for (let p = 0; p < NUM_PLAYERS; p++) {
    const owned = byOwner[p];
    if (owned.length === 0) continue;
    let remaining = STARTING_DICE_PER_PLAYER - owned.length;
    if (remaining <= 0) continue;
    let safety = remaining * 8 + owned.length;
    while (remaining > 0 && safety-- > 0) {
      const tid = owned[Math.floor(rng() * owned.length)];
      if (territories[tid].dice >= MAX_DICE_PER_TERRITORY) continue;
      territories[tid].dice++;
      remaining--;
    }
  }
}

/**
 * Final assembly: bind hex → territory, shuffle owners across territories,
 * assign starting dice, and compute the territory adjacency graph.
 */
function buildMap(hexes: Map<string, Hex>, rng: Rng): GameMap {
  const territories: Territory[] = Array.from(
    { length: NUM_TERRITORIES },
    (_, i) => ({ id: i, ownerId: 0, hexKeys: [], dice: 1 })
  );
  for (const [k, h] of hexes) {
    territories[h.territoryId].hexKeys.push(k);
  }

  const ownerOrder = shuffle(
    territories.map((t) => t.id),
    rng
  );
  ownerOrder.forEach((tid, idx) => {
    territories[tid].ownerId = idx % NUM_PLAYERS;
  });

  assignDice(territories, rng);

  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < NUM_TERRITORIES; i++) adjacency.set(i, new Set<number>());
  for (const h of hexes.values()) {
    for (const n of existingNeighbors(h, hexes)) {
      if (n.territoryId !== h.territoryId) {
        adjacency.get(h.territoryId)?.add(n.territoryId);
      }
    }
  }

  return { hexes, territories, adjacency };
}

/**
 * Interior void components (lakes). A void component is "exterior" if it
 * touches the rectangular grid boundary — that's the chewed-up coastline
 * around the playable area. Everything else is a lake fully enclosed by
 * playable hexes.
 */
function findInteriorLakes(playable: Map<string, Hex>): string[][] {
  const visited = new Set<string>();

  // Phase 1: flood-fill all exterior voids from boundary voids so the lake
  // pass below ignores them.
  for (let r = 0; r < ROWS; r++) {
    const qStart = rectQStart(r);
    for (let q = qStart; q < qStart + COLS; q++) {
      if (!isOnRectangleBoundary(q, r)) continue;
      const k = hexKey(q, r);
      if (playable.has(k) || visited.has(k)) continue;
      visited.add(k);
      const queue: HexCoord[] = [{ q, r }];
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        for (const n of hexAllNeighbors(cur)) {
          if (!isInRectangle(n.q, n.r)) continue;
          const nk = hexKey(n.q, n.r);
          if (playable.has(nk) || visited.has(nk)) continue;
          visited.add(nk);
          queue.push(n);
        }
      }
    }
  }

  // Phase 2: remaining unvisited voids are lakes.
  const lakes: string[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const qStart = rectQStart(r);
    for (let q = qStart; q < qStart + COLS; q++) {
      const k = hexKey(q, r);
      if (playable.has(k) || visited.has(k)) continue;
      const comp: string[] = [];
      const queue: HexCoord[] = [{ q, r }];
      visited.add(k);
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        comp.push(hexKey(cur.q, cur.r));
        for (const n of hexAllNeighbors(cur)) {
          if (!isInRectangle(n.q, n.r)) continue;
          const nk = hexKey(n.q, n.r);
          if (playable.has(nk) || visited.has(nk)) continue;
          visited.add(nk);
          queue.push(n);
        }
      }
      lakes.push(comp);
    }
  }
  return lakes;
}

/**
 * Plant a few explicit interior lakes by carving random-walk blobs out of
 * the deep interior. Target sizes are drawn from [MIN_LAKE_HEXES,
 * MAX_LAKE_HEXES], the same range cleanupLakes enforces.
 */
function seedLakes(hexes: Map<string, Hex>, rng: Rng): void {
  const dist = distanceFromBoundary(hexes);
  const candidates: Hex[] = [];
  for (const h of hexes.values()) {
    const k = hexKey(h.q, h.r);
    if ((dist.get(k) ?? 0) >= 2) candidates.push(h);
  }
  if (candidates.length === 0) return;

  const numLakes =
    LAKE_COUNT_MIN +
    Math.floor(rng() * (LAKE_COUNT_MAX - LAKE_COUNT_MIN + 1));
  const shuffled = shuffle(candidates, rng);

  let placed = 0;
  for (const seed of shuffled) {
    if (placed >= numLakes) break;
    const seedKey = hexKey(seed.q, seed.r);
    if (!hexes.has(seedKey)) continue;

    const target =
      MIN_LAKE_HEXES +
      Math.floor(rng() * (MAX_LAKE_HEXES - MIN_LAKE_HEXES + 1));

    const lake: HexCoord[] = [{ q: seed.q, r: seed.r }];
    hexes.delete(seedKey);

    while (lake.length < target) {
      const from = lake[Math.floor(rng() * lake.length)];
      const valid: HexCoord[] = [];
      for (const n of hexAllNeighbors(from)) {
        if (hexes.has(hexKey(n.q, n.r))) valid.push(n);
      }
      if (valid.length === 0) break;
      const next = valid[Math.floor(rng() * valid.length)];
      hexes.delete(hexKey(next.q, next.r));
      lake.push(next);
    }
    placed++;
  }
}

/**
 * Fill any lake outside [MIN_LAKE_HEXES, MAX_LAKE_HEXES] back into the
 * playable map. Deterministic — guarantees compliance in one pass instead
 * of burning retries.
 */
function cleanupLakes(hexes: Map<string, Hex>): void {
  const lakes = findInteriorLakes(hexes);
  for (const lake of lakes) {
    if (lake.length >= MIN_LAKE_HEXES && lake.length <= MAX_LAKE_HEXES) continue;
    for (const k of lake) {
      const [qStr, rStr] = k.split(",");
      const q = Number(qStr);
      const r = Number(rStr);
      hexes.set(k, { q, r, territoryId: -1 });
    }
  }
}

/** True iff any territory's hex count falls outside [MIN, MAX]_TERRITORY_HEXES. */
function violatesTerritoryConstraints(hexes: Map<string, Hex>): boolean {
  const sizes = new Array<number>(NUM_TERRITORIES).fill(0);
  for (const h of hexes.values()) sizes[h.territoryId]++;
  for (const s of sizes) {
    if (s < MIN_TERRITORY_HEXES) return true;
    if (s > MAX_TERRITORY_HEXES) return true;
  }
  return false;
}

/**
 * One full attempt: punch voids, prune to the largest connected island,
 * seed lakes, flood-fill territories. Returns null if any chunk-size
 * constraint or the minimum playable area is violated; caller retries.
 */
function tryGenerate(rng: Rng): GameMap | null {
  const hexes = buildEmptyGrid();
  punchVoids(hexes, rng);
  keepLargestComponent(hexes);
  seedLakes(hexes, rng);
  cleanupLakes(hexes);
  // Lake-walks can chew through a narrow neck and split the playable land.
  // cleanupLakes only filters by size, not connectivity, so re-prune to the
  // largest component.
  keepLargestComponent(hexes);
  if (hexes.size < MIN_PLAYABLE_HEXES) return null;
  if (!assignTerritories(hexes, rng)) return null;
  if (violatesTerritoryConstraints(hexes)) return null;
  return buildMap(hexes, rng);
}

/**
 * Generate a valid GameMap via repeated tryGenerate attempts. Throws after
 * MAX_GENERATION_ATTEMPTS unsuccessful tries.
 */
export function generateMap(rng: Rng = Math.random): GameMap {
  for (let i = 0; i < MAX_GENERATION_ATTEMPTS; i++) {
    const map = tryGenerate(rng);
    if (map) return map;
  }
  throw new Error("war of the dice: could not generate a viable map");
}
