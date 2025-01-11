import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useLongPress } from 'use-long-press';

import Flower from './Flower';
import Rain from './Rain';

import rainNoise from '../../assets/cloud_mumbles.mp3'
import thunderNoise from '../../assets/thunder.mp3'
import lightningBolt from '../../assets/bolt.gif'

import '../../styles/raincloud.css'

const DROPS_PER_SEC = 15;
const FLOWER_SPAWN_DROPS = 60;
const FLOWER_GROW_DROPS = 100;
const LIGHTNING_THRESHOLD = FLOWER_SPAWN_DROPS * 13;

export default function Raincloud({showLightning, setShowLightning}){
  const [numFlowers, setNumFlowers] = useState(0);
  const [numDrops, setNumDrops] = useState(0);
  const [dropsFallen, setDropsFallen] = useState(0);
  const [width, setWidth] = useState(window.innerWidth);

  const isMobile = width <= 768;
  const thunderSFX = useMemo(() => new Audio(thunderNoise), []);
  const rainSFX = useMemo(() => new Audio(rainNoise), []);
  rainSFX.loop = true;

  const incrNumFlowers = () => setNumFlowers((nf) => nf+1);

  const toggleRaining = useCallback((isRaining) => {
    setNumDrops(isRaining ? DROPS_PER_SEC : 0);
    isRaining ? rainSFX.play() : rainSFX.pause();
  }, [rainSFX]);

  const toggleLightning = useCallback((isLightning) => {
    setShowLightning(isLightning);
    if (isLightning) {
      rainSFX.pause();
      thunderSFX.play();
     } else {
      thunderSFX.pause();
      thunderSFX.currentTime = 0;
     }
  }, [rainSFX, setShowLightning, thunderSFX])

  const onCloudLongPressed = useLongPress(
    () => toggleRaining(true), 
    { onFinish: () => toggleRaining(false) }
  );

  const dribble = () => {
    setNumDrops(1);
    const t = setTimeout(() => setNumDrops(0), 600);
    return () => clearTimeout(t);
  }

  // clean up noises when we navigate away
  useEffect(() => {
    return () => {
      rainSFX.pause();
      thunderSFX.pause();
    }
  }, [rainSFX, thunderSFX]);

  // update width var when window changes size
  useEffect(() => {
    const handleWindowSizeChange = () => setWidth(window.innerWidth);
      window.addEventListener('resize', handleWindowSizeChange);
      return () => window.removeEventListener('resize', handleWindowSizeChange);
  }, [setWidth]);

  // make some new flowers
  useEffect(() => {
    if (dropsFallen % FLOWER_SPAWN_DROPS !== 1) return;
    if (showLightning) return;
    incrNumFlowers();
  }, [dropsFallen, showLightning]);

  // trigger lightning
  useEffect(() => {
    if (dropsFallen <= LIGHTNING_THRESHOLD && !showLightning) return;
    toggleLightning(true);
  }, [dropsFallen, showLightning, toggleLightning])

  // clean up lightning effects
  useEffect(() => {
    if (!showLightning) return;

    const timeoutId1 = setTimeout(() => setNumFlowers(0), 1_400);
    const timeoutId2 = setTimeout(() => {
      toggleRaining(false);
      toggleLightning(false);
      setDropsFallen(0);
      setNumFlowers(0);
    }, 7_000);

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
    };
  }, [showLightning, toggleRaining, toggleLightning]);

  const CloudImg = ({showLightning, numDrops}) => {
    const alt = 'a little cloud'
    const className = !showLightning && numDrops > 0 
      ? "cloud-gif" 
      : showLightning ? "cloud-img"
      : "cloud-img hoverable-cloud"
    return <img className={className} alt={alt} draggable={false}/>;
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
        {...onCloudLongPressed()}
        onClick={isMobile ? () => toggleRaining(!(numDrops > 0)) : dribble}
      >
      <CloudImg showLightning={showLightning} numDrops={numDrops}/>
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
