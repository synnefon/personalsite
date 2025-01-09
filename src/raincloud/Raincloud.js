import React, { useCallback, useEffect, useState } from 'react';
import { useLongPress } from 'use-long-press';
import Flower from './Flower';
import Rain from './Rain';

import cloudGif from '../assets/cloud.gif'
import cloudImg from '../assets/cloud.png'
import darkCloudImg from '../assets/darkCloud.png'
import lightningBolt from '../assets/bolt.gif'

import '../styles/raincloud.css'

const LIGHTNING_THRESHOLD = 11;
const DROPS_PER_SEC = 15;
const FLOWER_SPAWN_DELTA = 2_000;
const FLOWER_GROW_SPEED = 1_700;

export default function Raincloud({showLightning, setShowLightning}){
  const [isRaining, setIsRaining] = useState(false);
  const [darkCloud, setDarkCloud] = useState(false);
  const [numFlowers, setNumFlowers] = useState(1);
  const [numDrops, setNumDrops] = useState(0);

  const toggleRaining = useCallback((bool) => {
    setIsRaining(bool);
    setNumDrops(bool ? DROPS_PER_SEC : 0);
  }, [setNumDrops]);

  const bindCloudPressed = useLongPress(
    () => toggleRaining(true),
    {
      onFinish: () => toggleRaining(false),
      cancelOnMovement: true,
    }
  );

  const toggleDarkCloud = (bool) => setTimeout(() => setDarkCloud(bool), 100);

  useEffect(() => {
    if (!isRaining) return;

    if (numFlowers > LIGHTNING_THRESHOLD) {
      setShowLightning(true);
      return;
    }

    const timeoutId = setTimeout(() => setNumFlowers(() => numFlowers+1), FLOWER_SPAWN_DELTA);

    return () => clearTimeout(timeoutId);
  }, [isRaining, numFlowers, setShowLightning, toggleRaining]);

  useEffect(() => {
    if (!showLightning) return;

    toggleRaining(false);
    const timeoutId1 = setTimeout(() => setNumFlowers(0), 1_400);
    const timeoutId2 = setTimeout(() => setShowLightning(false), 3_000);

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
    };
  }, [showLightning, setShowLightning, toggleRaining]);

  const drip = () => {
    setNumDrops(1);
    setTimeout(() => setNumDrops(0), 600);
  }

  return (
    <div id="raincloud">
      <div 
        id="cloud" 
        {...bindCloudPressed()}
        onClick={drip}
        onMouseEnter={() => toggleDarkCloud(true)}
        onMouseLeave={() => toggleDarkCloud(false)}
      >
        <Rain numDrops={numDrops} showLightning={showLightning}/>
        {
          numDrops > 0 && !showLightning ? <img id="cloud-gif" alt="a little cloud gif" src={cloudGif} draggable={false}/>
          : darkCloud && !showLightning ? <img id="cloud-img" alt="a little cloud" src={darkCloudImg} draggable={false}/>
          : <img id="cloud-img" alt="a little cloud" src={cloudImg} draggable={false}/>
        }
      </div>
      {
        Array.from({ length: numFlowers }, (_, i) => i)
          .map((i) => <Flower key={i} id={i} isRaining={isRaining} growSpeed={FLOWER_GROW_SPEED}/>)
      }
      {showLightning && <img alt='lightning bolt!' id='lightning' src={lightningBolt}/>}
    </div>
  );
}
