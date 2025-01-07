import React, { useCallback, useEffect, useState } from 'react';
import { useLongPress } from 'use-long-press';

import dropImg from '../assets/drop.png'
import cloudGif from '../assets/cloud.gif'
import cloudImg from '../assets/cloud.png'
import darkCloudImg from '../assets/darkCloud.png'

import flower0 from '../assets/flower/flower0.png'
import flower1 from '../assets/flower/flower1.png'
import flower2 from '../assets/flower/flower2.png'
import flower3 from '../assets/flower/flower3.png'
import flower4 from '../assets/flower/flower4.png'
import flower5 from '../assets/flower/flower5.png'

import '../styles/raincloud.css'

function Rain({numDrops}) {
  const randRange = (minNum, maxNum) => (Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum);

  const startRain = useCallback(() => {
    const rain = document.getElementById('rain');

    for(let i = 1; i < numDrops; i++) {
      setTimeout(() => {    
        const drop = document.createElement('img');
        drop.setAttribute('src', dropImg);
        drop.setAttribute('class', 'drop');
        drop.setAttribute('id', `drop${i}`);
        drop.setAttribute('pointer-events', 'none')
  
        rain.appendChild(drop);
  
        drop.style.setProperty('--rand', `${(Math.random())*85}%`);
      }, randRange(0, 3_000));
    }
  }, [numDrops]);

  const stopRain = () => {
    const rain = document.getElementById('rain');

    while(rain.hasChildNodes()) {
      rain.removeChild(rain.lastChild);
    }
  }

  useEffect(() => {
    stopRain();
    startRain();
  }, [numDrops, startRain])

  return <div id="rain"/>;
}

export default function Raincloud({numDrops}){
  const [isRaining, setIsRaining] = useState(false);
  const [darkCloud, setDarkCloud] = useState(false);
  const [flowerIdx, setFlowerIdx] = useState(-1);

  const flowers = [flower0, flower1, flower2, flower3, flower4, flower5]

  useEffect(() => {
    let timeoutId = null
    if (!isRaining || flowerIdx >= flowers.length-1) {
      return () => clearTimeout(timeoutId || null);
    }

    timeoutId = setTimeout(() => {
      setFlowerIdx(() => flowerIdx+1)
    }, 3_000);

    return () => clearTimeout(timeoutId || null)
  }, [flowerIdx, flowers.length, isRaining])

  const bindCloudPressed = useLongPress(
    () => setIsRaining(true),
    {
      onFinish: () => setIsRaining(false),
      cancelOnMovement: true,
    }
  );

  const toggleDarkCloud = (b) => {
    setTimeout(() => {
      setDarkCloud(b)
    }, 100)
  }

  return (
    <div id="raincloud">
      <div 
        id="cloud" 
        {...bindCloudPressed()}
        onMouseEnter={() => toggleDarkCloud(true)}
        onMouseLeave={() => toggleDarkCloud(false)}
      >
        {isRaining ? <Rain numDrops={numDrops}/> : <></>}
        {
          isRaining ? <img id="cloud-gif" alt="a little cloud gif" src={cloudGif} draggable={false}/>
          : darkCloud ? <img id="cloud-img" alt="a little cloud" src={darkCloudImg} draggable={false}/>
          : <img id="cloud-img" alt="a little cloud" src={cloudImg} draggable={false}/>
        }
      </div>
      <img
        id="flower"
        alt="a growing flower"
        src={flowers[flowerIdx]}
        draggable={false}
        style={{'visibility': `${flowerIdx >= 0 ? 'visible' : 'hidden'}`}}
      />
    </div>
  );
}
