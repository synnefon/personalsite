export const formatTime = (millis) => {
  let seconds = Math.floor(millis / 1_000);
  const minutes =  Math.floor(seconds / 60);
  seconds -= minutes*60;
  return (minutes > 0 ? `${minutes}:` : "") + `${seconds < 10 ? 0 : ""}${seconds}`;
}