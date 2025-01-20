import React, { useCallback, useEffect, useState, useMemo } from 'react';

import { PersonalAudio } from '../util/Audio';
import Flower from './Flower';
import Rain from './Rain';

import rainNoise from '../assets/cloud_mumbles.mp3'
import thunderNoise from '../assets/thunder.mp3'
import lightningBolt from '../assets/bolt.gif'

import '../styles/raincloud.css'

const DROPS_PER_SEC = 15;
const FLOWER_SPAWN_DROPS = 60;
const FLOWER_GROW_DROPS = 100;
const LIGHTNING_THRESHOLD = FLOWER_SPAWN_DROPS * 13;

const CloudImg = ({showLightning, numDrops}) => {
  const alt = 'a little cloud'
  const className = !showLightning && numDrops > 0 
    ? "cloud-gif" 
    : showLightning ? "cloud-img"
    : "cloud-img hoverable-cloud"
  return <img className={className} alt={alt} draggable={false}/>;
}

export default function Raincloud({showLightning, setShowLightning}){
  const [numFlowers, setNumFlowers] = useState(0);
  const [numDrops, setNumDrops] = useState(0);
  const [dropsFallen, setDropsFallen] = useState(0);

  const thunderSFX = useMemo(() => new PersonalAudio(thunderNoise), []);
  const rainSFX = useMemo(() => new PersonalAudio(rainNoise, true), []);

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
      thunderSFX.reset();
     }
  }, [rainSFX, setShowLightning, thunderSFX])

  // clean up noises when we navigate away
  useEffect(() => {
    return () => {
      rainSFX.pause();
      thunderSFX.pause();
    }
  }, [rainSFX, thunderSFX]);

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
    }, 4_000);

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
    };
  }, [showLightning, toggleRaining, toggleLightning]);

  return (
    <div id="raincloud">
      <div id="rainfall-zone">
        <Rain
          numDrops={numDrops}
          showLightning={showLightning}
          setDropsFallen={setDropsFallen}
        />
        <div 
          id="cloud"
          onClick={() => toggleRaining(!(numDrops > 0))}
        >
          <CloudImg showLightning={showLightning} numDrops={numDrops}/>
        </div>
        {showLightning && <img alt='lightning bolt!' id='lightning' src={lightningBolt}/>}
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
    </div>
  );
}
