/*
  A tiny synth: one soft blip per connection, played through a shared audio
  context with a touch of reverb so voices overlap and ring rather than click.
  Must be primed from a user gesture.
*/

import { CONFIG } from "./config.ts";

let ctx: AudioContext | null = null;
let master: AudioNode | null = null;
let activeVoices = 0;
let muted = true;
/** Frequency multiplier on every blip, driven by the free-ball radius. */
let pitchFactor = 1;

/** Cap on simultaneous voices, so a growth burst sparkles instead of roaring. */
const MAX_VOICES = 16;
/** Random pitch per blip, from a pentatonic scale so overlaps stay consonant. */
const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0]; // C5 D5 E5 G5 A5
/** Octaves the largest radius drops below the smallest. */
const MAX_PITCH_DROP_OCTAVES = 2;

/** Build a decaying-noise impulse response to feed the convolver reverb. */
function makeImpulseResponse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/** Create or resume the audio context. Call from a user gesture (e.g. Start). */
export function initAudio(): void {
  if (typeof AudioContext === "undefined") return;
  if (!ctx) {
    ctx = new AudioContext();
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);

    // Voices fan out into a dry path and a wet (reverb) path, mixed at the
    // compressor — the tail keeps blips from clicking off abruptly.
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulseResponse(ctx, 1.6, 3);
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    const dry = ctx.createGain();
    dry.gain.value = 0.85;

    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(dry).connect(compressor);
    out.connect(convolver).connect(wet).connect(compressor);
    master = out;
  }
  if (ctx.state === "suspended") void ctx.resume();
}

/** One soft blip at a random pitch, with a long smooth fade. */
function playBlip(): void {
  if (!ctx || !master || ctx.state !== "running" || activeVoices >= MAX_VOICES) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = NOTES[Math.floor(Math.random() * NOTES.length)] * pitchFactor;
  // Soft attack, long exponential fade (ramps target non-zero values).
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  osc.connect(gain).connect(master);
  activeVoices++;
  osc.onended = () => {
    activeVoices--;
  };
  osc.start(now);
  osc.stop(now + 0.55);
}

/** Mute or unmute connection blips. */
export function setMuted(value: boolean): void {
  muted = value;
}

/**
 * Pitch the blips by free-ball radius: the smallest allowed radius plays
 * unshifted, the largest sounds MAX_PITCH_DROP_OCTAVES octaves lower, linear in
 * octaves between (so the midpoint radius is one octave down).
 */
export function setPitchForRadius(radius: number): void {
  const span = CONFIG.maxBallRadius - CONFIG.minBallRadius;
  const t = span > 0 ? (radius - CONFIG.minBallRadius) / span : 0;
  const clamped = Math.max(0, Math.min(1, t));
  pitchFactor = 2 ** (-MAX_PITCH_DROP_OCTAVES * clamped);
}

/** Play a blip per connection this frame, bounded so bursts don't pile up. */
export function playConnections(count: number): void {
  if (muted) return;
  const n = Math.min(count, 4);
  for (let i = 0; i < n; i++) playBlip();
}
