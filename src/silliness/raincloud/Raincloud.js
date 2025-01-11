import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useLongPress } from 'use-long-press';

import Flower from './Flower';
import Rain from './Rain';

import rainNoise from '../../assets/rain.mp3'
import thunderNoise from '../../assets/thunder.mp3'
import cloudGif from '../../assets/cloud.gif'
import cloudImg from '../../assets/cloud.png'
import darkCloudImg from '../../assets/darkCloud.png'
import lightningBolt from '../../assets/bolt.gif'

import '../../styles/raincloud.css'

const DROPS_PER_SEC = 15;
const FLOWER_SPAWN_DROPS = 60;
const FLOWER_GROW_DROPS = 100;
const LIGHTNING_THRESHOLD = FLOWER_SPAWN_DROPS * 13;

export default function Raincloud({showLightning, setShowLightning}){
  const [darkCloud, setDarkCloud] = useState(false);
  const [numFlowers, setNumFlowers] = useState(0);
  const [numDrops, setNumDrops] = useState(0);
  const [dropsFallen, setDropsFallen] = useState(0);
  const rainSFX = useMemo(() => new Audio(rainNoise), []);
  const thunderSFX = useMemo(() => new Audio(thunderNoise), []);
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleWindowSizeChange = () => setWidth(window.innerWidth);
      window.addEventListener('resize', handleWindowSizeChange);
      return () => window.removeEventListener('resize', handleWindowSizeChange);
  }, [setWidth]);

  const isMobile = width <= 768;

  const incrNumFlowers = () => setNumFlowers((nf) => nf+1);

  const fadeOutRain = useCallback(() => {
    if(rainSFX.volume > 0.1){
      rainSFX.volume -= 0.1;
      setTimeout(fadeOutRain, 80);
    } else{
      rainSFX.pause();
    }
  }, [rainSFX]);

  const toggleRaining = useCallback((isRaining) => {
    setNumDrops(isRaining ? DROPS_PER_SEC : 0);
    if (isRaining) {
      rainSFX.volume = 0.8;
      rainSFX.play();
    } else {
      fadeOutRain();
    }
  }, [fadeOutRain, rainSFX]);

  const bindCloudPressed = useLongPress(
    () => toggleRaining(true),
    {
      onFinish: () => toggleRaining(false),
      cancelOnMovement: true,
    }
  );

  const toggleDarkCloud = (bool) => setTimeout(() => setDarkCloud(bool), 100);

  // trigger lightning when enough drops fall
  useEffect(() => {
    if (dropsFallen <= LIGHTNING_THRESHOLD && !showLightning) return;
    console.log("triggering")
    thunderSFX.play();
    setShowLightning(true);
  }, [dropsFallen, rainSFX, setShowLightning, showLightning, thunderSFX])

  // make some new flowers
  useEffect(() => {
    if (dropsFallen % FLOWER_SPAWN_DROPS !== 1) return;
    if (showLightning) return;
    incrNumFlowers();
  }, [dropsFallen, showLightning]);

  // handle lightning effects & stop rain
  useEffect(() => {
    if (!showLightning) return;

    const timeoutId1 = setTimeout(() => setNumFlowers(0), 1_400);
    const timeoutId2 = setTimeout(() => {
      toggleRaining(false);
      setShowLightning(false);
      thunderSFX.pause();
      fadeOutRain();
      setDropsFallen(0);
      setNumFlowers(0);
    }, 7_000);

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
    };
  }, [showLightning, setShowLightning, toggleRaining, thunderSFX, fadeOutRain]);

  const dribble = () => {
    setNumDrops(1);
    setTimeout(() => setNumDrops(0), 600);
  }

  const CloudImg = () => {
    const alt = 'a little cloud'
    return (
      numDrops > 0 && !showLightning 
        ? <img id="cloud-gif" src={cloudGif} alt={alt} draggable={false}/>
        : darkCloud && !showLightning 
          ? <img id="cloud-img" src={darkCloudImg} alt={alt} draggable={false}/>
          : <img id="cloud-img" src={cloudImg} alt={alt} draggable={false}/>
    );
  }

  return (
    <div id="raincloud">
      <Rain
        numDrops={numDrops}
        showLightning={showLightning}
        setDropsFallen={setDropsFallen}
      />
      <div 
        id="cloud" 
        {...bindCloudPressed()}
        onClick={isMobile ? () => toggleRaining(!(numDrops > 0)) : dribble}
        onMouseEnter={() => toggleDarkCloud(true)}
        onMouseLeave={() => toggleDarkCloud(false)}
      >
      <CloudImg/>
      </div>
      {
        Array.from({ length: numFlowers }, (_, i) => i).map((i) => 
          <Flower 
            key={i} id={i}
            dropsFallen={dropsFallen}
            dropsToGrow={FLOWER_GROW_DROPS}
          />
        )
      }
      {showLightning && <img alt='lightning bolt!' id='lightning' src={lightningBolt}/>}
    </div>
  );
}
