import React, { useEffect, useState, useRef } from 'react';
import { simulateFlight, getInitialConditions, trajectoryToScreenCoordinates } from '../utils/paperPlanePhysics';

import '../styles/paperPlane.css';

/**
 * Animated paper airplane component
 * Simulates realistic glide physics when triggered
 */
const PaperPlaneAnimation = ({ startPosition, onComplete, scenario = 'equilibrium', direction = 'right' }) => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [trajectory, setTrajectory] = useState([]);
  const animationRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (!startPosition) return;

    // Generate flight trajectory
    const initialConditions = getInitialConditions(scenario);
    const flightPath = simulateFlight(initialConditions);
    const screenPath = trajectoryToScreenCoordinates(flightPath, startPosition, direction);

    setTrajectory(screenPath);
    startTimeRef.current = Date.now();

    // Animate
    const animate = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000; // seconds
      const frameIndex = Math.floor(elapsed / 0.01); // Match physics dt = 0.01s

      if (frameIndex < screenPath.length) {
        setCurrentFrame(frameIndex);
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete
        onComplete?.();
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPosition, scenario, direction]);

  if (!trajectory.length || currentFrame >= trajectory.length) {
    return null;
  }

  const position = trajectory[currentFrame];

  return (
    <div
      className="paper-plane-animated"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `translate(-50%, -50%) scaleX(${direction === 'left' ? -1 : 1}) rotate(${position.angle}deg)`,
        pointerEvents: 'none',
        zIndex: 9999,
        transition: 'none',
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="paper-plane-icon"
        style={{
          width: '32px',
          height: '32px',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
          fill: 'currentColor',
        }}
      >
        <path d="M1.77,6.215A2.433,2.433,0,0,0,0,8.611a2.474,2.474,0,0,0,.771,1.71L4,13.548V20h6.448l3.265,3.267a2.4,2.4,0,0,0,1.706.713,2.438,2.438,0,0,0,.618-.08,2.4,2.4,0,0,0,1.726-1.689L24-.016ZM3.533,8.856l13.209-3.7L7,14.9V12.326Zm11.6,11.6L11.675,17H9.1l9.734-9.741Z"/>
      </svg>
    </div>
  );
};

export default PaperPlaneAnimation;
