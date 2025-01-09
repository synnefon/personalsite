import React, { useEffect, useState } from 'react';

import personIcon from '../assets/person.png';
import selfGif from '../assets/self.gif';

import '../styles/self.css'

export default function Self() {
    const [showSelf, setShowSelf] = useState(false);
  
  const toggleShowSelf = () => {
    restartGif();
    setShowSelf(!showSelf);
  }

  const restartGif = () => { 
    const gif = document.getElementById("self-gif");
    gif.style = "display: none;";
    gif.style = "display: block;";
    if (gif) {
      setTimeout(() => {
        var imgSrc = gif.src;
        gif.src = imgSrc; 
      }, 0);
    }
  }

  useEffect(() => {
    if (!showSelf) return;
    const timeoutId = setTimeout(() => setShowSelf(false), 12_000);

    return () => clearTimeout(timeoutId);
  }, [showSelf]);

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