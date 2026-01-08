import React, { useState, useEffect, useRef } from 'react';
import { useDvdScreensaver } from 'react-dvd-screensaver'
import { getRandomColor, invertColor } from '../util/Color';

import '../styles/wip.css'

export default function Wip() {
  const [color, setColor] = useState(getRandomColor());
  const { containerRef, elementRef, impactCount } = useDvdScreensaver({speed: (window.innerWidth / 2_000) * 3});
  const lastColorChangeRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastColorChangeRef.current >= 300) {
      setColor(getRandomColor());
      lastColorChangeRef.current = now;
    }
  }, [impactCount]);

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
          desktop only
        </div>
      </div>
  );
}