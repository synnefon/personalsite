// ============================================
// AMBIENT MUSIC
// ============================================

// A slow generative loop to float alongside the background rings: a
// low two-note drone that breathes, and a random walk over a major
// pentatonic scale playing long soft notes into a feedback delay.
// Everything is synthesized, so there is no audio asset to load.

// C major pentatonic, C4..A5
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

// small melodic moves, biased toward steps over leaps
const WALK = [-2, -1, -1, 1, 1, 2];

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

export function startAmbientMusic() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const now = () => ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  // space: master also feeds a feedback delay, mixed back in quietly
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.45;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  master.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(ctx.destination);

  // drone: root + fifth, faded in, gently breathing via a slow lfo
  const droneGain = ctx.createGain();
  droneGain.gain.setValueAtTime(0, now());
  droneGain.gain.linearRampToValueAtTime(0.05, now() + 6);
  droneGain.connect(master);
  for (const freq of [110, 164.81]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(droneGain);
    osc.start();
  }
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.06;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.018;
  lfo.connect(lfoDepth);
  lfoDepth.connect(droneGain.gain);
  lfo.start();

  // one long soft note: triangle carrier over a sine an octave down
  const playNote = (freq, peak) => {
    const t = now();
    const attack = rand(1.2, 2.4);
    const release = rand(2.5, 4.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.linearRampToValueAtTime(0, t + attack + release);
    gain.connect(master);
    for (const [type, f, level] of [
      ["triangle", freq, 1],
      ["sine", freq / 2, 0.5],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const oscGain = ctx.createGain();
      oscGain.gain.value = level;
      osc.connect(oscGain);
      oscGain.connect(gain);
      osc.start(t);
      osc.stop(t + attack + release + 0.1);
    }
  };

  let step = (Math.random() * SCALE.length) | 0;
  let timer;
  const playNext = () => {
    // while the context is suspended (no user gesture yet), scheduled
    // notes would pile up on a frozen clock and fire as one cluster on
    // resume — hold off and just keep the loop ticking
    if (ctx.state === "running") {
      step = Math.min(Math.max(step + WALK[(Math.random() * WALK.length) | 0], 0), SCALE.length - 1);
      const peak = rand(0.09, 0.15);
      playNote(SCALE[step], peak);
      // sometimes a companion a scale-third above
      if (Math.random() < 0.25 && step + 2 < SCALE.length) playNote(SCALE[step + 2], peak * 0.6);
    }
    timer = setTimeout(playNext, rand(2200, 4800));
  };
  playNext();

  return {
    // autoplay rules start the context suspended until a user gesture
    resume: () => {
      if (ctx.state === "suspended") ctx.resume();
    },
    stop: () => {
      clearTimeout(timer);
      master.gain.setValueAtTime(master.gain.value, now());
      master.gain.linearRampToValueAtTime(0, now() + 1.2);
      setTimeout(() => ctx.close(), 1400);
    },
  };
}
