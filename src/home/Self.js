import personIcon from '../assets/person.png';
import selfGif from '../assets/self.gif';

import '../styles/self.css'

export default function Self({showSelf, toggleShowSelf}) {
  return (
    <>
      <img 
        id="person-icon"
        className={`${showSelf ? 'invisible' : ''}`}
        alt="a pixelated person"
        src={personIcon}
        onClick={toggleShowSelf}
      />
      <img 
        id="self-gif"
        alt="a gif of the author waving"
        src={selfGif} 
        style={{display: showSelf ? 'block' : 'none'}}
      />
    </>
  );
}