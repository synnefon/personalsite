// Synthesized gunshot: a sharp noise crack layered over a short low thump.
// Mirrors the per-sound AudioContext style used in home/eightBitSynth.js.

export function playGunshot(volume = 0.32) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;

  const ctx = new Ctx();
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  // Noise crack with a fast decay envelope
  const dur = 0.18;
  const frames = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const decay = 1 - i / frames;
    data[i] = (Math.random() * 2 - 1) * decay * decay;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1700;
  band.Q.value = 0.7;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(1, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  noise.connect(band).connect(noiseGain).connect(master);

  // Low thump for body
  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(160, now);
  thump.frequency.exponentialRampToValueAtTime(48, now + 0.12);

  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.9, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

  thump.connect(thumpGain).connect(master);

  noise.start(now);
  thump.start(now);
  thump.stop(now + 0.16);

  setTimeout(() => ctx.close().catch(() => {}), 350);
}
