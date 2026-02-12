// @ts-expect-error - Asset import
import musicAudioNoise from "../assets/lavaLamp/guitar.mp3";
// @ts-expect-error - Asset import
import clickAudioNoise from "../assets/lavaLamp/click.mp3";
import { AudioSource } from "./config.ts";

export const AUDIO_SOURCE_CONFIG = {
  [AudioSource.forest]: {
    label: "redwood resonance",
    url: musicAudioNoise,
    info: null,
  },
  [AudioSource.kexp]: {
    label: "kexp",
    url: "https://kexp.streamguys1.com/kexp160.aac",
  },
  [AudioSource.bbcradio6music]: {
    label: "bbc radio 6 music",
    url: "http://as-hls-ww-live.akamaized.net/pool_81827798/live/ww/bbc_6music/bbc_6music.isml/bbc_6music-audio%3d96000.norewind.m3u8",
  }
} as const;

export const CLICK_AUDIO_URL = clickAudioNoise;

export type AudioSourceConfig = typeof AUDIO_SOURCE_CONFIG;
export type { AudioSource };
