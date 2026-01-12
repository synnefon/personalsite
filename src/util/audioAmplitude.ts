/**
 * Audio amplitude analysis for visualizing music playback.
 * Uses Web Audio API's AnalyserNode to extract real-time amplitude data.
 */

export class AudioAmplitudeAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private connected = false;

  /**
   * Initialize and connect the analyser to an audio element.
   * Must be called after user interaction to avoid autoplay restrictions.
   */
  connect(audioElement: HTMLAudioElement): boolean {
    if (this.connected) return true;

    try {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // Small size for performance
      this.analyser.smoothingTimeConstant = 0.8; // Smooth out jitter

      const source = this.audioContext.createMediaElementSource(audioElement);
      source.connect(this.analyser).connect(this.audioContext.destination);

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.connected = true;

      return true;
    } catch (err) {
      console.warn('[AudioAmplitude] Failed to connect analyser:', err);
      return false;
    }
  }

  /**
   * Get current amplitude as a value between 0 and 1.
   * Uses RMS (root mean square) for smooth, accurate amplitude measurement.
   */
  getAmplitude(): number {
    if (!this.analyser || !this.dataArray) return 0;

    try {
      // Get time domain data (waveform)
      this.analyser.getByteTimeDomainData(this.dataArray);

      // Calculate RMS amplitude
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        const normalized = (this.dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / this.dataArray.length);

      // Boost the signal for better visualization (typical music is quiet)
      return Math.min(1, rms * 3);
    } catch (err) {
      console.warn('[AudioAmplitude] Error reading amplitude:', err);
      return 0;
    }
  }

  /**
   * Resume audio context if suspended (required on some browsers after page load).
   */
  resume(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch((err) => {
        console.warn('[AudioAmplitude] Failed to resume audio context:', err);
      });
    }
  }

  /**
   * Clean up resources.
   */
  disconnect(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(() => {
        // ignore
      });
      this.audioContext = null;
    }
    this.analyser = null;
    this.dataArray = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
