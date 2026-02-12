import Hls from "hls.js";

export class PersonalAudio extends Audio {
  constructor(src, loop = false) {
    super();
    this.crossOrigin = "anonymous";
    this.loop = loop;

    this._hls = null;
    this._logicalSrc = null;

    if (src) this.setSource(src, { autoplay: false, loop });
  }

  get logicalSrc() {
    return this._logicalSrc ?? this.src;
  }

  // --- main API you should use instead of assigning .src directly ---
  async setSource(src, { autoplay = false, loop = this.loop } = {}) {
    this.loop = loop;
    this.crossOrigin = "anonymous";

    const wasPlaying = this.isPlaying();
    this.pause();

    this._detachHls();
    this._logicalSrc = src;

    const isHls = /\.m3u8(\?.*)?$/i.test(src);

    if (!isHls) {
      this.src = src;
      this.load();
      if (autoplay || wasPlaying) await this._safePlayWhenReady();
      return;
    }

    // HLS: Safari plays natively; others need hls.js
    const canNativeHls = this.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (canNativeHls) {
      this.src = src;
      this.load();
      if (autoplay || wasPlaying) await this._safePlayWhenReady();
      return;
    }

    if (!Hls.isSupported()) {
      // If you hit this, you’re on an environment without MSE support.
      throw new Error("HLS not supported in this browser (no MSE).");
    }

    const hls = new Hls();
    this._hls = hls;

    hls.attachMedia(this);
    hls.loadSource(src);

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      console.error("hls.js error", data);
      if (!data.fatal) return;

      // basic recovery
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    });

    if (autoplay || wasPlaying) {
      await new Promise((resolve, reject) => {
        const onParsed = () => {
          hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
          resolve();
        };
        const onErr = (_evt, data) => {
          if (!data.fatal) return;
          hls.off(Hls.Events.ERROR, onErr);
          reject(new Error(`Fatal HLS error: ${data.type} / ${data.details}`));
        };
        hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
        hls.on(Hls.Events.ERROR, onErr);
      });

      await this._safePlay();
    }
  }

  _detachHls() {
    if (!this._hls) return;
    try {
      this._hls.destroy();
    } finally {
      this._hls = null;
    }
  }

  async _safePlayWhenReady() {
    // canplaythrough is unreliable for live streams; use canplay instead
    if (this.readyState >= 3) return this._safePlay();

    await new Promise((resolve) => {
      const onCanPlay = () => resolve();
      this.addEventListener("canplay", onCanPlay, { once: true });
      // if it errors, just resolve and let play() handle rejection
      this.addEventListener("error", () => resolve(), { once: true });
    });

    await this._safePlay();
  }

  async _safePlay() {
    try {
      await this.play();
    } catch {
      // autoplay blocked etc. swallow by design
    }
  }

  isPlayingSrc = (audioSrc) => {
    const s = this.logicalSrc ?? "";
    return s.includes(audioSrc) && this.isPlaying();
  };

  isPlaying = () =>
    this.currentTime > 0 && !this.paused && !this.ended && this.readyState > 2;

  timeLeft = () => this.duration - this.currentTime;

  reset = () => {
    this.pause();
    try {
      this.currentTime = 0;
    } catch {
      // live streams may be non-seekable
    }
  };

  destroy = () => {
    this.reset();
    this._detachHls();
    this.removeAttribute("src");
    this.load();
  };
}
