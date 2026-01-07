/**
 * Generate and play a random 8-bit synth sound
 * Simulates a synth with random settings for retro game-like audio
 * Returns a stop function to end the sound
 */

export function playRandom8BitSound() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // Prefer softer waveforms (triangle and sine more likely than square)
  const waveTypes = ['triangle', 'triangle', 'sine', 'square'];
  const waveType = waveTypes[Math.floor(Math.random() * waveTypes.length)];

  // Hindustani raga scale with all komal (flat) notes except Sa, Ma, and Pa
  // Sa Re(k) Ga(k) Ma Pa Dha(k) Ni(k) Sa'
  const frequencies = [
    261.63,  // Sa (C4) - Tonic
    277.18,  // Re komal (D♭4) - Flat
    311.13,  // Ga komal (E♭4) - Flat
    349.23,  // Ma (F4) - Natural
    392.00,  // Pa (G4) - Natural
    415.30,  // Dha komal (A♭4) - Flat
    466.16,  // Ni komal (B♭4) - Flat
    523.25   // Sa' (C5) - Octave
  ];
  const baseFreq = frequencies[Math.floor(Math.random() * frequencies.length)];

  // Create oscillator
  const oscillator = audioContext.createOscillator();
  oscillator.type = waveType;
  oscillator.frequency.setValueAtTime(baseFreq, audioContext.currentTime);

  // Subtle frequency modulation (vibrato only, no harsh pitch bends)
  const freqMod = Math.random() > 0.6;
  if (freqMod) {
    const targetFreq = baseFreq * (0.98 + Math.random() * 0.04); // Very subtle
    oscillator.frequency.exponentialRampToValueAtTime(targetFreq, audioContext.currentTime + 0.3);
  }

  // Create gain node for envelope
  const gainNode = audioContext.createGain();

  // Smoother envelope shape with lower volume
  const attackTime = 0.05 + Math.random() * 0.05;
  const sustainLevel = 0.15 + Math.random() * 0.15;

  // Attack to sustain (no release until stop is called)
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + attackTime);
  gainNode.gain.linearRampToValueAtTime(sustainLevel * 0.15, audioContext.currentTime + attackTime + 0.08);

  // Add harmony more often with consonant intervals
  let oscillator2 = null;
  let gainNode2 = null;
  if (Math.random() > 0.3) {
    oscillator2 = audioContext.createOscillator();
    oscillator2.type = 'triangle'; // Always use triangle for harmony
    const interval = [1.5, 2][Math.floor(Math.random() * 2)]; // Perfect fifth or octave only
    oscillator2.frequency.setValueAtTime(baseFreq * interval, audioContext.currentTime);

    gainNode2 = audioContext.createGain();
    gainNode2.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode2.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + attackTime);
    gainNode2.gain.linearRampToValueAtTime(sustainLevel * 0.08, audioContext.currentTime + attackTime + 0.08);

    oscillator2.connect(gainNode2);
    gainNode2.connect(audioContext.destination);
    oscillator2.start();
  }

  // Connect and play
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();

  // Return stop function
  return () => {
    const releaseTime = 0.2;
    const now = audioContext.currentTime;

    // Release envelope
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0, now + releaseTime);

    if (gainNode2) {
      gainNode2.gain.cancelScheduledValues(now);
      gainNode2.gain.setValueAtTime(gainNode2.gain.value, now);
      gainNode2.gain.linearRampToValueAtTime(0, now + releaseTime);
    }

    // Stop oscillators
    oscillator.stop(now + releaseTime);
    if (oscillator2) {
      oscillator2.stop(now + releaseTime);
    }

    // Clean up
    setTimeout(() => {
      audioContext.close();
    }, (releaseTime + 0.1) * 1000);
  };
}
