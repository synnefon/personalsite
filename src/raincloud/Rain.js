import React, { useCallback, useEffect, useState } from 'react';

import dropImg from '../assets/drop.png'
import '../styles/raincloud.css'

export default function Rain({numDrops, showLightning, setDropsFallen}) {
  const [canMakeDrops, setCanMakeDrops] = useState(true)
  const randRange = (minNum, maxNum) => (Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum);

  const makeDrop = useCallback(() => {
    const rain = document.getElementById('rain');

    if (numDrops <= 0) return;
    
    const drop = document.createElement('img');

    drop.setAttribute('src', dropImg);
    drop.setAttribute('class', 'drop');
    drop.setAttribute('id', `drop`);
    drop.setAttribute('pointer-events', 'none')

    try { rain.appendChild(drop) } 
    catch {};

    drop.style.setProperty('--rand', `${(Math.random())*85}%`);    
    const t2 = setTimeout(() => {
      try{ 
        rain.removeChild(drop);
        setDropsFallen((df) => df + 1);
      }
      catch{};
    }, 3_000);

    return () => clearTimeout(t2);
  }, [numDrops, setDropsFallen]);

  const startRain = useCallback(() => {
    if (!canMakeDrops) return;
    if (numDrops <= 0) return;
    for (let i=0; i<numDrops; i++) {
      setTimeout(makeDrop, randRange(0, (1_000)));
    }
    
    setCanMakeDrops(false);
    setTimeout(() => setCanMakeDrops(true), randRange(0, (1_000)));
  }, [makeDrop, numDrops, canMakeDrops]);

  useEffect(() => startRain(), [numDrops, startRain]);

  return (
    <div 
      id="rain"
      style={{'visibility': showLightning ? 'hidden' : 'visible'}}
    />
  );
}