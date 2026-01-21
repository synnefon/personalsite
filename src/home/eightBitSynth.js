// Duck quack sound - plays audio file
export function playPopSound(audioUrl) {
  if (!audioUrl) return;

  const audio = new Audio(audioUrl);
  audio.volume = 0.6;
  audio.play().catch((err) => console.warn("Audio play failed:", err));
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

// Musical patterns
const PATTERNS = {
  // Arpeggios (chord tones)
  majorArpeggio: [0, 4, 7, 12, 16], // Major chord arpeggio (root, maj3rd, 5th, octave, maj3rd)
  minorArpeggio: [0, 3, 7, 12, 15], // Minor chord arpeggio (root, min3rd, 5th, octave, min3rd)
  diminishedArpeggio: [0, 3, 6, 9, 12], // Diminished arpeggio (stacked minor 3rds)
  augmentedArpeggio: [0, 4, 8, 12, 16], // Augmented arpeggio (stacked major 3rds)
  dominantSeventhArpeggio: [0, 4, 7, 10, 12], // Dominant 7th arpeggio

  // Scales
  majorScale: [0, 2, 4, 5, 7], // Major scale (5 notes)
  minorScale: [0, 2, 3, 5, 7], // Natural minor scale (5 notes)
  pentatonic: [0, 2, 4, 7, 9], // Pentatonic scale
  bluesScale: [0, 3, 5, 6, 7], // Blues scale (5 notes)
  chromatic: [0, 1, 2, 3, 4], // Chromatic run (half-steps)
  wholeTone: [0, 2, 4, 6, 8], // Whole tone scale
};

/**
 * Returns randomized parameters for a retro 8-bit synth sound.
 */
function getRandom8BitParams() {
  const waveTypes = ["triangle", "sine", "square", "sawtooth"];
  const patternKeys = Object.keys(PATTERNS);
  const selectedPattern = patternKeys[(Math.random() * patternKeys.length) | 0];

  // Find max offset in the selected pattern
  const pattern = PATTERNS[selectedPattern];
  const maxOffset = Math.max(...pattern);

  // Ensure baseFreqIndex + maxOffset stays within chromaticScale bounds (0-21)
  const maxBaseIndex = chromaticScale.length - 1 - maxOffset;
  const baseFreqIndex = (Math.random() * (maxBaseIndex + 1)) | 0;

  return {
    waveType: waveTypes[(Math.random() * waveTypes.length) | 0],
    baseFreqIndex,
    keyNote: chromaticScale[baseFreqIndex].name,
    attackTime: 0.05 + Math.random() * 0.05,
    sustainLevel: 0.15 + Math.random() * 0.15,
    hasHarmony: Math.random() > 0.3,
    interval: [1.5, 2][(Math.random() * 2) | 0],
    pattern: selectedPattern,
  };
}

/**
 * Compute the frequency and base note for the current arpeggio step.
 */
function getArpeggiatedNote(params, arpeggioStep, scale = chromaticScale) {
  const pattern = PATTERNS[params.pattern] || PATTERNS.pentatonic;
  const freqIdx = params.baseFreqIndex + pattern[arpeggioStep % pattern.length];
  const note = scale[freqIdx];
  return note ? note.freq : scale[0].freq;
}

/**
 * Configure envelope on a GainNode for the synth attack/sustain phase.
 */
function applyGainEnvelope(
  gain,
  now,
  attackTime,
  sustainLevel,
  volumeMultiplier,
  multiplier = 0.15
) {
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
    gain,
    now,
    params.attackTime,
    params.sustainLevel,
    volumeMultiplier
  );
  osc.connect(gain).connect(ctx.destination);
  osc.start();

  // Optional harmony
  let harmonyOsc = null,
    harmonyGain = null;
  if (params.hasHarmony) {
    harmonyOsc = ctx.createOscillator();
    harmonyOsc.type = "triangle";
    harmonyOsc.frequency.value = baseFreq * params.interval;
    harmonyGain = ctx.createGain();
    applyGainEnvelope(
      harmonyGain,
      now,
      params.attackTime,
      params.sustainLevel,
      volumeMultiplier,
      0.08
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
    const rel = 0.2,
      t = ctx.currentTime;
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
