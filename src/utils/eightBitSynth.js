// Simple percussive pop sound
export function playPopSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = 150;
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
  gain.gain.value = 0.3;
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
  setTimeout(() => ctx.close(), 200);
}

// 2 octaves chromatic scale from C4 for 8-bit synth
export const chromaticScale = [
  { name: "C4", freq: 261.63 },
  { name: "C#4/Db4", freq: 277.18 },
  { name: "D4", freq: 293.66 },
  { name: "D#4/Eb4", freq: 311.13 },
  { name: "E4", freq: 329.63 },
  { name: "F4", freq: 349.23 },
  { name: "F#4/Gb4", freq: 369.99 },
  { name: "G4", freq: 392 },
  { name: "G#4/Ab4", freq: 415.3 },
  { name: "A4", freq: 440 },
  { name: "A#4/Bb4", freq: 466.16 },
  { name: "B4", freq: 493.88 },
  { name: "C5", freq: 523.25 },
  { name: "C#5/Db5", freq: 554.37 },
  { name: "D5", freq: 587.33 },
  { name: "D#5/Eb5", freq: 622.25 },
  { name: "E5", freq: 659.25 },
  { name: "F5", freq: 698.46 },
  { name: "F#5/Gb5", freq: 739.99 },
  { name: "G5", freq: 783.99 },
  { name: "G#5/Ab5", freq: 830.61 },
  { name: "A5", freq: 880 },
];

/**
 * Returns randomized parameters for a retro 8-bit synth sound.
 */
function getRandom8BitParams() {
  const waveTypes = ["triangle", "triangle", "sine", "square"];
  return {
    waveType: waveTypes[(Math.random() * waveTypes.length) | 0],
    baseFreqIndex: (Math.random() * 12) | 0,
    attackTime: 0.05 + Math.random() * 0.05,
    sustainLevel: 0.15 + Math.random() * 0.15,
    hasHarmony: Math.random() > 0.3,
    interval: [1.5, 2][(Math.random() * 2) | 0],
  };
}

/**
 * Compute the frequency and base note for the current arpeggio step.
 */
function getArpeggiatedNote(params, arpeggioStep, scale = chromaticScale) {
  const pentatonic = [0, 2, 4, 7, 9];
  const freqIdx = params.baseFreqIndex + pentatonic[arpeggioStep % pentatonic.length];
  const note = scale[freqIdx];
  return note ? note.freq : scale[0].freq;
}

/**
 * Configure envelope on a GainNode for the synth attack/sustain phase.
 */
function applyGainEnvelope(gain, now, attackTime, sustainLevel, volumeMultiplier, multiplier = 0.15) {
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(
    multiplier * volumeMultiplier,
    now + attackTime
  );
  gain.gain.linearRampToValueAtTime(
    sustainLevel * multiplier * volumeMultiplier,
    now + attackTime + 0.08
  );
}

/**
 * Helper to create, configure, and start the main and harmony oscillators (if needed).
 */
function createOscillators(ctx, params, baseFreq, volumeMultiplier, now) {
  // Main oscillator
  const osc = ctx.createOscillator();
  osc.type = params.waveType;
  osc.frequency.value = baseFreq;
  const gain = ctx.createGain();
  applyGainEnvelope(
    gain, now, params.attackTime, params.sustainLevel, volumeMultiplier
  );
  osc.connect(gain).connect(ctx.destination);
  osc.start();

  // Optional harmony
  let harmonyOsc = null, harmonyGain = null;
  if (params.hasHarmony) {
    harmonyOsc = ctx.createOscillator();
    harmonyOsc.type = "triangle";
    harmonyOsc.frequency.value = baseFreq * params.interval;
    harmonyGain = ctx.createGain();
    applyGainEnvelope(
      harmonyGain, now, params.attackTime, params.sustainLevel, volumeMultiplier, 0.08
    );
    harmonyOsc.connect(harmonyGain).connect(ctx.destination);
    harmonyOsc.start();
  }

  return { osc, gain, harmonyOsc, harmonyGain };
}

/**
 * Play retro-game style 8-bit synth blip.
 * Returns {stop, params}.
 */
export function playRandom8BitSound(
  volumeMultiplier = 1.0,
  soundParams = null,
  arpeggioStep = 0
) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const params = soundParams || getRandom8BitParams();

  const baseFreq = getArpeggiatedNote(params, arpeggioStep, chromaticScale);
  const now = ctx.currentTime;

  const { osc, gain, harmonyOsc, harmonyGain } = createOscillators(
    ctx,
    params,
    baseFreq,
    volumeMultiplier,
    now
  );

  function stop() {
    const rel = 0.2, t = ctx.currentTime;
    // Envelope release
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + rel);
    if (harmonyGain) {
      harmonyGain.gain.cancelScheduledValues(t);
      harmonyGain.gain.setValueAtTime(harmonyGain.gain.value, t);
      harmonyGain.gain.linearRampToValueAtTime(0, t + rel);
    }
    osc.stop(t + rel);
    if (harmonyOsc) harmonyOsc.stop(t + rel);
    setTimeout(() => ctx.close(), (rel + 0.1) * 1000);
  }

  return { stop, params };
}
