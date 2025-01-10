import React, { useState, useEffect } from 'react';
import { useDvdScreensaver } from 'react-dvd-screensaver'
import { getRandomColor, invertColor } from '../util/Color';

import '../styles/wip.css'

export default function Wip() { 
  const [color, setColor] = useState(getRandomColor());
  const { containerRef, elementRef, impactCount } = useDvdScreensaver({speed: (window.innerWidth / 2_000) * 2});

  useEffect(() => setColor(getRandomColor()), [impactCount]);

  return (
      <div
        ref={containerRef}
        id="bounce-room"
        style={{
          color: color.rgb,
          backgroundColor: invertColor(color).rgb,
        }}
      >
        <div ref={elementRef} id="bouncing-text">
          work in progress
        </div>
      </div>
  );
}