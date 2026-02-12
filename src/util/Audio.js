import Hls from "hls.js";

export class PersonalAudio extends Audio {
  constructor(src, loop = false) {
    super();
    this.crossOrigin = "anonymous";
    this.loop = loop;

    this._hls = null;
    this._logicalSrc = null;

    this._setSourceSeq = 0;

    if (src) this.setSource(src, { autoplay: false, loop });
  }

  get logicalSrc() {
    return this._logicalSrc ?? this.src;
  }

  async setSource(src, { autoplay = false, loop = this.loop } = {}) {
    const seq = ++this._setSourceSeq;

    this.loop = loop;
    this.crossOrigin = "anonymous";

    // Better than isPlaying() for streams
    const shouldAutoplay = autoplay || !this.paused;

    this.pause();

    this._detachHls();
    this._logicalSrc = src;

    const isHls = /\.m3u8(\?.*)?$/i.test(src);

    // HLS: Safari plays natively; others need hls.js
    const canNativeHls =
      isHls && this.canPlayType("application/vnd.apple.mpegurl") !== "";

    // Non-HLS OR native-HLS (Safari): use plain Audio src
    if (!isHls || canNativeHls) {
      this.src = src;
      this.load();
      if (shouldAutoplay) {
        await this._safePlayWhenReady();
        if (seq !== this._setSourceSeq) return; // stale
      }
      return;
    }

    // HLS (non-Safari)
    if (!Hls.isSupported()) {
      throw new Error("HLS not supported in this browser (no MSE).");
    }

    const hls = new Hls();
    this._hls = hls;

    hls.attachMedia(this);
    hls.loadSource(src);

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      console.error("hls.js error", data);
      if (!data.fatal) return;

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    });

    if (!shouldAutoplay) return;

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

    if (seq !== this._setSourceSeq) return; // stale
    await this._safePlay();
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
    // Try immediately first (best for live streams)
    await this._safePlay();
    if (!this.paused) return;

    await new Promise((resolve) => {
      this.addEventListener("canplay", () => resolve(), { once: true });
      this.addEventListener("error", () => resolve(), { once: true });
    });

    await this._safePlay();
  }

  async _safePlay() {
    try { await this.play(); }
    catch (e) { console.log("play() failed:", e); }
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
    } catch { }
  };

  destroy = () => {
    this.reset();
    this._detachHls();
    this.removeAttribute("src");
    this.load();
  };
}
