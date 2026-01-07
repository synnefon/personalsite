/**
 * Generate and play a random 8-bit synth sound
 * Simulates a synth with random settings for retro game-like audio
 * Returns a stop function to end the sound
 */

export function playRandom8BitSound() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // Random oscillator type (8-bit typically uses square or sawtooth)
  const waveTypes = ['square', 'sawtooth', 'triangle'];
  const waveType = waveTypes[Math.floor(Math.random() * waveTypes.length)];

  // Random frequency (musical notes in a reasonable range)
  const frequencies = [130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
  const baseFreq = frequencies[Math.floor(Math.random() * frequencies.length)];

  // Create oscillator
  const oscillator = audioContext.createOscillator();
  oscillator.type = waveType;
  oscillator.frequency.setValueAtTime(baseFreq, audioContext.currentTime);

  // Random frequency modulation (vibrato/pitch bend)
  const freqMod = Math.random() > 0.5;
  if (freqMod) {
    const targetFreq = baseFreq * (0.8 + Math.random() * 0.4);
    oscillator.frequency.exponentialRampToValueAtTime(targetFreq, audioContext.currentTime + Math.random() * 0.5);
  }

  // Create gain node for envelope
  const gainNode = audioContext.createGain();

  // Random envelope shape
  const attackTime = Math.random() * 0.1;
  const sustainLevel = 0.2 + Math.random() * 0.4;

  // Attack to sustain (no release until stop is called)
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + attackTime);
  gainNode.gain.linearRampToValueAtTime(sustainLevel * 0.3, audioContext.currentTime + attackTime + 0.1);

  // Optional: Add a second oscillator for harmony (50% chance)
  let oscillator2 = null;
  let gainNode2 = null;
  if (Math.random() > 0.5) {
    oscillator2 = audioContext.createOscillator();
    oscillator2.type = waveTypes[Math.floor(Math.random() * waveTypes.length)];
    const interval = [1.5, 2, 2.5, 3][Math.floor(Math.random() * 4)]; // Perfect fifth, octave, etc
    oscillator2.frequency.setValueAtTime(baseFreq * interval, audioContext.currentTime);

    gainNode2 = audioContext.createGain();
    gainNode2.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode2.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + attackTime);
    gainNode2.gain.linearRampToValueAtTime(sustainLevel * 0.15, audioContext.currentTime + attackTime + 0.1);

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
