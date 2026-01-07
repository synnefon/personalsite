export class PersonalAudio extends Audio {
  constructor(src, loop=false) {
    super(src);
    this.loop = loop;
  };

  isPlayingSrc = (audioSrc) => {
    return this.src?.includes(audioSrc)
        && this.currentTime > 0
        && !this.paused
        && !this.ended
        && this.readyState > 2;
  };

  isPlaying = () => {
    return this.currentTime > 0
        && !this.paused
        && !this.ended
        && this.readyState > 2;
  };

  timeLeft = () => this.duration - this.currentTime;

  reset = () => {
    this.pause();
    this.currentTime = 0;
  };
}