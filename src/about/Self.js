import React, { useEffect, useState } from 'react';

import selfGif from '../assets/about/self.gif';


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
    const personIcon = document.getElementById('person-icon');
    const toggleWiggle = () =>  personIcon.classList.toggle('hovered-person');
    personIcon.addEventListener("mouseover", toggleWiggle);
    personIcon.addEventListener("mouseleave", toggleWiggle);

    return () => {
      personIcon.removeEventListener("mouseover", toggleWiggle);
      personIcon.removeEventListener("mouseleave", toggleWiggle);
    };
  }, []);

  // handle showing the gif of the author waving
  useEffect(() => {
    if (!showSelf) return;
    const timeoutId = setTimeout(() => setShowSelf(false), 12_000);

    return () => clearTimeout(timeoutId);
  }, [showSelf]);

  return (
    <>
      <span
        id="person-icon"
        role="img"
        aria-label="the author"
        className={`${showSelf ? 'invisible' : ''}`}
        onClick={toggleShowSelf}
      >
        {"( ͡° ͜ʖ ͡°)"}
      </span>
      <img
        id="self-gif"
        alt="a gif of the author waving"
        src={selfGif}
        style={{display: showSelf ? 'block' : 'none'}}
      />
    </>
  );
}