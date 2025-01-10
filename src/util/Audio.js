export const fadeOut = (audio) => {
  if(audio.volume > 0.1){
    audio.volume -= 0.1;
    setTimeout(fadeOut, 20);
  } else{
    audio.pause();
  }
};