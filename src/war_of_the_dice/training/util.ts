/* eslint-disable no-console */
import * as fs from "fs";
import * as path from "path";
import type { ModelWeights } from "../model/forward.ts";
import { deserializeWeights } from "./tfModel.ts";

/** Fisher–Yates shuffle in place. Pass an `rng` for determinism. */
export function shuffleInPlace<T>(
  arr: T[],
  rng: () => number = Math.random,
): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/**
 * Parse a numeric env var with a default. Throws on NaN so we don't silently
 * run with a config typo (e.g. WOTD_GAMES=abc).
 */
export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`env var ${name}=${raw} is not a number`);
  }
  return parsed;
}

/**
 * Standard "run an async main, log + exit 1 on failure" wrapper. Use:
 *   runMain(async () => { ... })
 */
export function runMain(fn: () => Promise<void>): void {
  fn().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

/**
 * Resolve the checkpoint to load given a precedence chain. Used by both
 * `evaluate.ts` (env-var first) and `bake.ts` (argv first). Returns the
 * first existing file path; throws with a helpful message if none exist.
 */
export function resolveCheckpoint(opts: {
  override?: string;
  ckptDir: string;
  // Filenames to look for in ckptDir, in priority order. First hit wins.
  candidates: ReadonlyArray<string>;
}): string {
  if (opts.override) return path.resolve(opts.override);
  for (const name of opts.candidates) {
    const candidate = path.join(opts.ckptDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `no checkpoint found in ${opts.ckptDir} (looked for ${opts.candidates.join(", ")})`,
  );
}

/** Ensure a directory exists (mkdir -p). */
export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Mulberry32 — small, fast, decent-quality PRNG. Deterministic given a
 * 32-bit seed. Good enough for training reproducibility (not for crypto).
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a deterministic 32-bit seed from a free-form string. Uses
 * djb2-style hashing — collisions are possible but irrelevant for our
 * use case (one training run per seed string).
 */
function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Resolve an RNG from an optional seed string. Empty/undefined → Math.random
 * (non-deterministic). Any string → seedable Mulberry32.
 */
export function makeRng(seed: string | undefined): () => number {
  if (!seed) return Math.random;
  return mulberry32(hashSeed(seed));
}


/**
 * Wilson 95% binomial confidence interval for `k` successes out of `n`
 * trials. Returns `[low, high]` clamped to `[0, 1]`. Returns `[0, 0]`
 * when `n === 0` to keep the caller from dividing by zero.
 */
export function wilson95(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/**
 * Resolve + load + deserialize a value-network checkpoint. Logs the
 * resolved path. Used by evaluate / roundRobin / calibrate.
 */
export function loadCheckpointWeights(opts: {
  override?: string;
  ckptDir: string;
  candidates: ReadonlyArray<string>;
}): ModelWeights {
  const ckptPath = resolveCheckpoint(opts);
  console.log(`loading weights from ${ckptPath}`);
  const raw = JSON.parse(fs.readFileSync(ckptPath, "utf8"));
  return deserializeWeights(raw);
}
