// Synthesized gun sounds over a single shared AudioContext.
//
// Each shot used to spin up its own AudioContext, but a freshly created context
// has cold-start latency and may begin life "suspended" (browser autoplay
// policy). Gun cracks are tiny transients (tens of ms), so on a cold context the
// hardware isn't producing output yet and the whole sound is missed — you hear
// nothing until rapid repeat firing happens to warm a context / unlock audio.
// One shared context that we resume on demand stays warm, so every shot is
// audible from the first trigger.

let sharedCtx = null;

// Lazily create the shared context and resume it if the browser suspended it.
// Safe to call from any user gesture (arming, pointerdown) to warm audio early.
export function primeGunAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) sharedCtx = new Ctx();
  if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

// A per-shot gain node (its own volume) feeding the shared context's output.
function makeBus(volume) {
  const ctx = primeGunAudio();
  if (!ctx) return null;
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  return { ctx, master };
}

// Disconnect a finished shot's master gain so nodes don't pile up on the shared
// context. The one-shot sources/oscillators feeding it stop on their own and are
// GC'd once detached.
function releaseSoon(master, ms) {
  setTimeout(() => {
    try {
      master.disconnect();
    } catch {}
  }, ms);
}

// Filtered white-noise burst with a fast quadratic decay
function noiseBurst(ctx, master, now, { dur, freq, q, peak, type = "bandpass" }) {
  const frames = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const decay = 1 - i / frames;
    data[i] = (Math.random() * 2 - 1) * decay * decay;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const band = ctx.createBiquadFilter();
  band.type = type;
  band.frequency.value = freq;
  band.Q.value = q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  src.connect(band).connect(gain).connect(master);
  src.start(now);
}

// Pitch-swept oscillator tone
function tone(ctx, master, now, { type, f0, f1, dur, peak }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, now);
  osc.frequency.exponentialRampToValueAtTime(f1, now + dur);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

// Soft-clip (tanh) curve — saturates hard transients into a loud, gritty crack
function distortionCurve(amount) {
  const n = 512;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x);
  }
  return curve;
}

export function playGunshot(volume = 0.65) {
  const r = makeBus(volume);
  if (!r) return;
  const { ctx, master } = r;
  const now = ctx.currentTime;

  // Bright crack layers driven hard into soft-clip saturation = the "bang"
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(3);
  shaper.oversample = "4x";
  shaper.connect(master);

  noiseBurst(ctx, shaper, now, { dur: 0.02, freq: 6000, q: 0.3, peak: 1.2, type: "highpass" });
  noiseBurst(ctx, shaper, now, { dur: 0.08, freq: 1900, q: 0.25, peak: 1.3, type: "highpass" });
  noiseBurst(ctx, shaper, now, { dur: 0.13, freq: 1100, q: 0.5, peak: 1 });

  // Quick clean low punch for body — short, so it's a snap not a thud
  tone(ctx, master, now, { type: "triangle", f0: 180, f1: 70, dur: 0.05, peak: 0.55 });

  releaseSoon(master, 350);
}

export function playUziShot(volume = 0.16) {
  const r = makeBus(volume);
  if (!r) return;
  const now = r.ctx.currentTime;
  noiseBurst(r.ctx, r.master, now, { dur: 0.07, freq: 2500, q: 1.0, peak: 1 });
  tone(r.ctx, r.master, now, { type: "square", f0: 220, f1: 90, dur: 0.05, peak: 0.4 });
  releaseSoon(r.master, 180);
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Charging whine: rising pitch + swelling volume over durationMs.
// Returns a handle whose stop() fades it out (call on release).
export function startLaserCharge(durationMs = 3000) {
  const r = makeBus(0.2);
  if (!r) return { stop() {} };
  const { ctx, master } = r;
  const now = ctx.currentTime;
  const dur = durationMs / 1000;

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.exponentialRampToValueAtTime(1500, now + dur);

  const harm = ctx.createOscillator();
  harm.type = "sine";
  harm.frequency.setValueAtTime(220, now);
  harm.frequency.exponentialRampToValueAtTime(3000, now + dur);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.12);
  gain.gain.linearRampToValueAtTime(0.55, now + dur); // louder as it charges

  // Tremolo shimmer
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 16;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.09;
  lfo.connect(lfoGain).connect(gain.gain);

  osc.connect(gain).connect(master);
  harm.connect(gain);
  osc.start(now);
  harm.start(now);
  lfo.start(now);

  return {
    stop() {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
      gain.gain.linearRampToValueAtTime(0.0001, t + 0.05);
      osc.stop(t + 0.08);
      harm.stop(t + 0.08);
      lfo.stop(t + 0.08);
      releaseSoon(master, 200);
    },
  };
}

// Discharge: longer/deeper/louder the more it was charged (0..1).
export function playLaserShot(charge = 1) {
  const c = clamp01(charge);
  const r = makeBus(0.26 + c * 0.2);
  if (!r) return;
  const { ctx, master } = r;
  const now = ctx.currentTime;
  const dur = 0.45 + c * 0.8;

  // Feedback echo for a spacey, drawn-out sci-fi tail (more when charged)
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.085;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.4 + c * 0.15;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(master);

  const bus = ctx.createGain();
  bus.connect(master);
  bus.connect(delay);

  // Vibrato LFO warble (deeper when charged)
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 26;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 45 + c * 45;
  lfo.connect(lfoDepth);

  // Main sweep — released from higher, falls deeper when charged
  const main = ctx.createOscillator();
  main.type = "sawtooth";
  main.frequency.setValueAtTime(1300 + c * 900, now);
  main.frequency.exponentialRampToValueAtTime(140 - c * 90, now + dur);
  lfoDepth.connect(main.frequency);
  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0.0001, now);
  mainGain.gain.linearRampToValueAtTime(0.5, now + 0.02);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  main.connect(mainGain).connect(bus);

  // Detuned square body
  const body = ctx.createOscillator();
  body.type = "square";
  body.frequency.setValueAtTime(900 + c * 300, now);
  body.frequency.exponentialRampToValueAtTime(70 - c * 22, now + dur);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.linearRampToValueAtTime(0.22, now + 0.02);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.85);
  body.connect(bodyGain).connect(bus);

  // High shimmer sparkle
  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(3200, now);
  shimmer.frequency.exponentialRampToValueAtTime(700, now + 0.3);
  const shimGain = ctx.createGain();
  shimGain.gain.setValueAtTime(0.13, now);
  shimGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  shimmer.connect(shimGain).connect(bus);

  // Big sub-boom impact, scales hard with charge
  tone(ctx, master, now, { type: "sine", f0: 170, f1: 38, dur: 0.25 + c * 0.45, peak: 0.3 + c });

  const stopAt = now + dur + 0.05;
  lfo.start(now);
  main.start(now);
  body.start(now);
  shimmer.start(now);
  lfo.stop(stopAt);
  main.stop(stopAt);
  body.stop(stopAt);
  shimmer.stop(now + 0.35);

  releaseSoon(master, 1800);
}
