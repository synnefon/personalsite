// @ts-expect-error - Asset import
import musicAudioNoise from "../assets/lavaLamp/guitar.mp3";
// @ts-expect-error - Asset import
import clickAudioNoise from "../assets/lavaLamp/click.mp3";
import { AudioSource } from "./config.ts";

export const AUDIO_SOURCE_CONFIG = {
  // [AudioSource.wfmu]: {
  //   label: "wfmu",
  //   url: "https://stream0.wfmu.org/freeform-128k.mp3",
  //   info: null,
  //   homepage: "https://www.wfmu.org/index.shtml",
  // },
  // [AudioSource.xrayfm]: {
  //   label: "xray.fm",
  //   url: "https://listen.xray.fm/stream",
  //   info: "https://bbc-now-playing.connor-j-hopkins.workers.dev/xray/now",
  //   homepage: "https://xray.fm/",
  // },
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
  [AudioSource.nts1]: {
    label: "nts 1",
    url: "https://stream-relay-geo.ntslive.net/stream",
    info: "https://bbc-now-playing.connor-j-hopkins.workers.dev/nts/track/now?channel=1&limit=5",
    homepage: "https://www.nts.live/",
  },
  [AudioSource.nts2]: {
    label: "nts 2",
    url: "https://stream-relay-geo.ntslive.net/stream2",
    info: "https://bbc-now-playing.connor-j-hopkins.workers.dev/nts/track/now?channel=2&limit=5",
    homepage: "https://www.nts.live/",
  },
  [AudioSource.kcrw]: {
    label: "kcrw",
    url: "https://kcrw.streamguys1.com/kcrw_192k_aac_on_air",
    info: "https://bbc-now-playing.connor-j-hopkins.workers.dev/kcrw/now",
    homepage: "https://www.kcrw.com/music/shows",
  },
  [AudioSource.bbcradio6music]: {
    label: "bbc radio 6 music",
    url: "https://as-hls-ww-live.akamaized.net/pool_81827798/live/ww/bbc_6music/bbc_6music.isml/bbc_6music-audio%3d96000.norewind.m3u8",
    info: "https://bbc-now-playing.connor-j-hopkins.workers.dev/bbc/6music/now",
    homepage: "https://www.bbc.co.uk/sounds/play/live/bbc_6music",
  },
} as const;

export const CLICK_AUDIO_URL = clickAudioNoise;

export type AudioSourceConfig = typeof AUDIO_SOURCE_CONFIG;
export type { AudioSource };
