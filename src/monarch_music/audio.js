import { TAAL_LENGTH, TAAL_ACCENTS } from "./scales";

// ── Tuning ──────────────────────────────────────────────

const BASE_MIDI = 48; // C3
const OCTAVES = 3;
const DAYS_PER_SECOND = 1;
const MAX_NOTES_PER_DAY = 30;
const MAX_CHORDS = 4;
const MIN_CHORD_GAP = 0.1;
const MIN_SEMITONE_GAP = 3;

const DRONE_THRESHOLD = 3;   // consecutive days before a pitch becomes a drone
const VOICE_FADE_IN = 0.05;
const VOICE_FADE_OUT = 0.8;

// ── Pitch helpers ───────────────────────────────────────

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function latToNote(lat, scale) {
  const noteCount = scale.length * OCTAVES;
  const normalized = Math.max(0, Math.min(1, (lat - 15) / 40));
  const index = Math.floor(normalized * (noteCount - 1));
  const octave = Math.floor(index / scale.length);
  const degree = index % scale.length;
  return BASE_MIDI + octave * 12 + scale[degree];
}

export function lonToPan(lon) {
  return Math.max(-1, Math.min(1, (lon + 95) / 35));
}

// ── Audio context setup ─────────────────────────────────

export function createAudioContext() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 12;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;

  const master = ctx.createGain();
  master.gain.value = 1.0;

  compressor.connect(master);
  master.connect(ctx.destination);

  // Drone state: midi -> { voice, consecutiveDays }
  const drones = new Map();
  // Track pitch streak counts: midi -> consecutiveDays
  const streaks = new Map();

  return { ctx, compressor, master, drones, streaks };
}

// ── Drone voice management ──────────────────────────────

function startDrone(ctx, dest, midi, pan, volume) {
  const freq = midiToFreq(midi);

  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(dest);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq * 3;
  filter.Q.value = 0.7;
  filter.connect(panner);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + VOICE_FADE_IN);
  gainNode.connect(filter);

  const oscs = [];

  // Fundamental + quiet octave
  [{ ratio: 1, amp: 1.0, detune: 0 }, { ratio: 2.002, amp: 0.04, detune: 3 }].forEach(({ ratio, amp, detune }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq * ratio;
    osc.detune.value = detune;
    gain.gain.value = amp;

    if (ratio === 1) {
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vib.frequency.value = 4.5;
      vibGain.gain.value = 2;
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);
      vib.start(ctx.currentTime);
      oscs.push(vib);
    }

    osc.connect(gain);
    gain.connect(gainNode);
    osc.start(ctx.currentTime);
    oscs.push(osc);
  });

  return { oscs, gainNode, panner, filter };
}

function releaseDrone(ctx, voice) {
  const t = ctx.currentTime;
  voice.gainNode.gain.cancelScheduledValues(t);
  voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, t);
  voice.gainNode.gain.linearRampToValueAtTime(0, t + VOICE_FADE_OUT);

  setTimeout(() => {
    voice.oscs.forEach((osc) => { try { osc.stop(); } catch (_) {} });
    voice.gainNode.disconnect();
  }, VOICE_FADE_OUT * 1000 + 50);
}

function updateDroneVolume(ctx, voice, volume) {
  const t = ctx.currentTime;
  voice.gainNode.gain.cancelScheduledValues(t);
  voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, t);
  voice.gainNode.gain.linearRampToValueAtTime(volume, t + VOICE_FADE_IN);
}

// ── Plucked note (fire-and-forget) ──────────────────────

function pluckNote(ctx, dest, freq, pan, volume, chordSize) {
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(dest);

  const overtoneAmp = chordSize > 3 ? 0.03 : 0.07;
  const partials = [
    { ratio: 1, amp: 1.0, decay: 1.2, detune: 0 },
    { ratio: 2.002, amp: overtoneAmp, decay: 0.5, detune: 3 },
    { ratio: 3.008, amp: overtoneAmp * 0.3, decay: 0.25, detune: -4 },
  ];

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(freq * 5, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.6);
  filter.Q.value = 0.7;
  filter.connect(panner);

  partials.forEach(({ ratio, amp, decay, detune }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq * ratio;
    osc.detune.value = detune;

    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume * amp, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + decay);

    if (ratio === 1) {
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vib.frequency.value = 4.5;
      vibGain.gain.value = 2;
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);
      vib.start(t + 0.15);
      vib.stop(t + decay);
    }

    osc.connect(gain);
    gain.connect(filter);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  });
}

// ── Chord building ──────────────────────────────────────

function buildChord(sightings, scale) {
  const midis = sightings.map((s) => ({ midi: latToNote(s.lat, scale), s }));
  midis.sort((a, b) => a.midi - b.midi);
  const filtered = [];
  midis.forEach(({ midi, s }) => {
    if (!filtered.length || midi - filtered[filtered.length - 1].midi >= MIN_SEMITONE_GAP) {
      filtered.push({ midi, s });
    }
  });
  return filtered;
}

// ── Play a full day ─────────────────────────────────────

// Returns an array of { sighting, delayMs } for syncing visuals
export function playDay(ctx, dest, drones, streaks, daySightings, dayIndex, scale) {
  const taalAccent = TAAL_ACCENTS[dayIndex % TAAL_LENGTH];
  const schedule = [];

  let toPlay = daySightings;
  if (toPlay.length > MAX_NOTES_PER_DAY) {
    const step = toPlay.length / MAX_NOTES_PER_DAY;
    toPlay = Array.from({ length: MAX_NOTES_PER_DAY }, (_, i) => daySightings[Math.floor(i * step)]);
  }

  const chord = buildChord(toPlay, scale);
  const todayMidis = new Set(chord.map(({ midi }) => midi));

  // Update streaks
  const newStreaks = new Map();
  for (const { midi } of chord) {
    newStreaks.set(midi, (streaks.get(midi) || 0) + 1);
  }
  streaks.clear();
  for (const [k, v] of newStreaks) streaks.set(k, v);

  // Release drones whose pitch is no longer present
  for (const [midi, voice] of drones) {
    if (!todayMidis.has(midi)) {
      releaseDrone(ctx, voice);
      drones.delete(midi);
    }
  }

  // Split chord into drones vs plucks
  const droneNotes = [];
  const pluckNotes = [];
  for (const { midi, s } of chord) {
    if (streaks.get(midi) >= DRONE_THRESHOLD) {
      droneNotes.push({ midi, s });
    } else {
      pluckNotes.push({ midi, s });
    }
  }

  // Handle drones — immediate (delay 0)
  for (const { midi, s } of droneNotes) {
    const streak = streaks.get(midi) || DRONE_THRESHOLD;
    const age = streak - DRONE_THRESHOLD;
    const diminuendo = Math.max(0.3, 1 - age * 0.04);
    const droneVol = Math.min(0.04, 0.15 / Math.max(droneNotes.length, 1)) * taalAccent * diminuendo;
    const pan = lonToPan(s.lon);
    if (drones.has(midi)) {
      updateDroneVolume(ctx, drones.get(midi), droneVol);
    } else {
      drones.set(midi, startDrone(ctx, dest, midi, pan, droneVol));
      schedule.push({ sighting: s, delayMs: 0 });
    }
  }

  // Handle plucks — staggered across chord slots
  if (pluckNotes.length) {
    const dayDuration = 1 / DAYS_PER_SECOND;
    const numChords = Math.min(pluckNotes.length, MAX_CHORDS);
    const chordGap = numChords > 1
      ? Math.max(MIN_CHORD_GAP, dayDuration / numChords)
      : 0;

    const slots = Array.from({ length: numChords }, () => []);
    pluckNotes.forEach((n, i) => {
      slots[Math.floor(i * numChords / pluckNotes.length)].push(n);
    });

    const totalPlucks = pluckNotes.length;
    let noteIndex = 0;

    slots.forEach((slot, ci) => {
      const baseVol = Math.min(0.15, 0.6 / Math.max(slot.length, 1)) * taalAccent;
      const offsetSec = ci * chordGap;
      const offsetMs = offsetSec * 1000;

      slot.forEach(({ midi, s }) => {
        const crescendo = 0.4 + 0.6 * (noteIndex / Math.max(totalPlucks - 1, 1));
        const freq = midiToFreq(midi);
        const pan = lonToPan(s.lon);

        if (offsetSec > 0) {
          setTimeout(() => pluckNote(ctx, dest, freq, pan, baseVol * crescendo, slot.length), offsetMs);
        } else {
          pluckNote(ctx, dest, freq, pan, baseVol * crescendo, slot.length);
        }
        schedule.push({ sighting: s, delayMs: offsetMs });
        noteIndex++;
      });
    });
  }

  return schedule;
}

// ── Release all ─────────────────────────────────────────

export function releaseAll(ctx, drones, streaks) {
  for (const [, voice] of drones) releaseDrone(ctx, voice);
  drones.clear();
  streaks.clear();
}

export { DAYS_PER_SECOND };
