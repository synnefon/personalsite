// @ts-expect-error - Asset import
import musicAudioNoise from "../assets/lavaLamp/guitar.mp3";
// @ts-expect-error - Asset import
import clickAudioNoise from "../assets/lavaLamp/click.mp3";
import { AUDIO_SOURCES } from "./config.ts";
import type { AudioSource } from "./config.ts";

export const AUDIO_SOURCE_CONFIG = {
  [AUDIO_SOURCES.REDWOOD]: {
    label: "redwood meditation",
    url: musicAudioNoise,
  },
  [AUDIO_SOURCES.KEXP]: {
    label: "kexp",
    url: "https://kexp.streamguys1.com/kexp160.aac",
  },
} as const;

export const CLICK_AUDIO_URL = clickAudioNoise;

export type AudioSourceConfig = typeof AUDIO_SOURCE_CONFIG;
export type { AudioSource };
