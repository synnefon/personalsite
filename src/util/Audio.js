export class PersonalAudio extends Audio {
  isPlayingSrc = (audioSrc) => {
    return this.src?.includes(audioSrc)
        && this.currentTime > 0
        && !this.paused
        && !this.ended
        && this.readyState > 2;
  }

  timeLeft = () => this.duration - this.currentTime;
}