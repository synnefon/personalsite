import React, { useEffect, useState } from 'react';
import { randomChoice } from '../util/Random';

import '../styles/raincloud.css'

export default function Flower({id, isRaining, growSpeed}) {
  const [flowerType] = useState(randomChoice(['a', 'b', 'c', 'd']));
  
  const [flowerIdx, setFlowerIdx] = useState(0);
  const [left] = useState(`${(Math.random() - 0.15)*100}%`);

  useEffect(() => {
    let timeoutId = null
    if (!isRaining || flowerIdx >= 5) return () => clearTimeout(timeoutId);
    timeoutId = setTimeout(() => setFlowerIdx(() => flowerIdx+1), growSpeed);
    return () => clearTimeout(timeoutId);
  }, [flowerIdx, growSpeed, isRaining]);

  return (
    <img
      className="flower"
      id={`flower${id}`}
      alt="a growing flower"
      src={require(`../assets/flower_${flowerType}/flower${flowerIdx}.gif`)}
      draggable={false}
      style={{
        'visibility': `${flowerIdx >= 0 ? 'visible' : 'hidden'}`,
        'left': left
      }}
    />
  );
}