import React, { useEffect, useState } from 'react';
import { randomChoice } from '../util/Random';

import '../styles/raincloud.css'

export default function Flower({id, dropsToGrow, dropsFallen}) {
  const [flowerType] = useState(randomChoice(['a', 'b', 'c', 'd']));
  const [nextGrowth, setNextGrowth] = useState(dropsFallen + dropsToGrow);
  const [flowerIdx, setFlowerIdx] = useState(1);

  const [left] = useState(`${(Math.random() - 0.1)*100}%`);

  useEffect(() => {
    if (flowerIdx >= 5) return;
    if (dropsFallen < nextGrowth) return;
    setFlowerIdx(() => flowerIdx+1);
    setNextGrowth((nextGrowth) => nextGrowth + dropsToGrow);
  }, [dropsFallen, dropsToGrow, flowerIdx, left, nextGrowth]);

  return (
    <img
      className="flower"
      id={`flower${id}`}
      alt="a growing flower"
      src={require(`../assets/flower_${flowerType}/flower${flowerIdx}.gif`)}
      draggable={false}
      style={{'left': left}}
    />
  );
}