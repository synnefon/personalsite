/**
 * LocalStorage utilities for persisting state
 */

import { MUSIC_TIME_KEY } from "./constants.ts";

export function readSavedMusicTimeSeconds(): number {
  try {
    const raw = localStorage.getItem(MUSIC_TIME_KEY);
    if (!raw) return 0;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function writeSavedMusicTimeSeconds(seconds: number): void {
  try {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    localStorage.setItem(MUSIC_TIME_KEY, String(seconds));
  } catch {
    // ignore
  }
}
