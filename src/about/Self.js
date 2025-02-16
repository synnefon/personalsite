import React, { useEffect, useRef, useState } from 'react';

import selfGif from '../assets/self.gif';


export default function Self({listExpanded}) {
  const [showSelf, setShowSelf] = useState(false);
  const hasWiggled = useRef(false);

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

  useEffect(() => {
    const toggleWiggle = () => {
      if (!listExpanded || hasWiggled.current) return;
      const personIcon = document.getElementById('person-icon');
      personIcon?.classList.toggle('hovered-person');
    };

    if (!listExpanded || hasWiggled.current) return;

    for (let t of [3, 6, 15, 25]) {
      const first = t * 1_000;
      const second = first + 450;
      const duration = 410;
      for (let t of [first, first+duration, second, second+duration]) {
        setTimeout(toggleWiggle, t);
      }
    }

    setTimeout(() => {
      if (!listExpanded || hasWiggled.current) return;
      hasWiggled.current = true;
      setShowSelf(true);
    }, 45_000);
  }, [listExpanded, hasWiggled]);

  return (
    <>
      <img 
        id="person-icon"
        className={`${showSelf ? 'invisible' : ''}`}
        alt="a pixelated person"
        onClick={toggleShowSelf}
        onMouseEnter={() => hasWiggled.current = true}
      />
      <img 
        id="self-gif"
        alt="a gif of the author waving"
        src={selfGif} 
        style={{display: showSelf ? 'block' : 'none'}}
        onMouseEnter={() => hasWiggled.current = true}
      />
    </>
  );
}