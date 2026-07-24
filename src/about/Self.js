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
    const personFooter = document.getElementById('person-footer');
    const toggleWiggle = () => personFooter.classList.toggle('hovered-person');
    personFooter.addEventListener("mouseover", toggleWiggle);
    personFooter.addEventListener("mouseleave", toggleWiggle);

    return () => {
      personFooter.removeEventListener("mouseover", toggleWiggle);
      personFooter.removeEventListener("mouseleave", toggleWiggle);
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
      <div
        id="person-footer"
        className={`${showSelf ? 'invisible' : ''}`}
        onClick={toggleShowSelf}
      >
        <span id="person-icon" role="img" aria-label="the author">
          {"( ͡° ͜ʖ ͡°)"}
        </span>
        <span id="person-copyright">
          © connor hopkins, {new Date().getFullYear()}
        </span>
      </div>
      <img
        id="self-gif"
        alt="a gif of the author waving"
        src={selfGif}
        style={{display: showSelf ? 'block' : 'none'}}
      />
    </>
  );
}