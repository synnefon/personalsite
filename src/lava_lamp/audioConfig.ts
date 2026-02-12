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
    homepage: "https://youtu.be/t3LCXpKI9K0?si=LnBH9g-s6e1wuEhw",
  },
  [AudioSource.kexp]: {
    label: "kexp",
    url: "https://kexp.streamguys1.com/kexp160.aac",
    info: "https://api.kexp.org/v2/plays/?limit=5",
    homepage: "https://www.kexp.org/playlist/",
  },
  [AudioSource.bbcradio6music]: {
    label: "bbc radio 6 music",
    url: "http://as-hls-ww-live.akamaized.net/pool_81827798/live/ww/bbc_6music/bbc_6music.isml/bbc_6music-audio%3d96000.norewind.m3u8",
    info: "https://bbc-now-playing.connor-j-hopkins.workers.dev/bbc/6music/now",
    homepage: "https://www.bbc.co.uk/sounds/play/live/bbc_6music",
  }
} as const;

export const CLICK_AUDIO_URL = clickAudioNoise;

export type AudioSourceConfig = typeof AUDIO_SOURCE_CONFIG;
export type { AudioSource };
