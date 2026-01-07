import React, { useEffect, useState, useRef } from 'react';
import { getInitialConditions } from '../utils/paperPlanePhysics';

import '../styles/paperPlane.css';

/**
 * Animated paper airplane component
 * Simulates realistic glide physics when triggered
 */
const PaperPlaneAnimation = ({ startPosition, onComplete, scenario = 'equilibrium', direction = 'right', gustState }) => {
  const [position, setPosition] = useState(null);
  const animationRef = useRef(null);
  const stateRef = useRef(null);
  const lastGustTimestampRef = useRef(0);
  const offscreenTimeoutRef = useRef(null);

  useEffect(() => {
    if (!startPosition) return;

    // Initialize simulation state
    const initialConditions = getInitialConditions(scenario);
    stateRef.current = { ...initialConditions };

    // Physics constants
    const S = 0.017, m = 0.003, rho = 1.225, g = 9.8;
    const AR = 0.86, e = 0.9, CD0 = 0.02;
    const K = 1 / (Math.PI * e * AR);
    const CLeq = Math.sqrt(CD0 / K);
    const CDeq = CD0 + K * CLeq ** 2;
    const dt = 0.01;
    const initialHeight = stateRef.current.H;
    const scale = 100;

    // Animate with real-time simulation
    const animate = () => {
      const state = stateRef.current;
      if (!state) return;

      // Step physics (simple Euler integration)
      const q = 0.5 * rho * state.V ** 2;
      const L = q * S * CLeq, D = q * S * CDeq;
      const dVdt = -(D + m * g * Math.sin(state.Gam)) / m;
      const dGamdt = (L - m * g * Math.cos(state.Gam)) / (m * state.V);
      const dHdt = state.V * Math.sin(state.Gam);
      const dRangedt = state.V * Math.cos(state.Gam);

      state.V += dVdt * dt;
      state.Gam += dGamdt * dt;
      state.H += dHdt * dt;
      state.Range += dRangedt * dt;

      // Convert to screen coordinates
      const directionMultiplier = direction === 'left' ? -1 : 1;
      const x = startPosition.x + state.Range * scale * directionMultiplier;
      const y = startPosition.y + (initialHeight - state.H) * scale;
      const angle = (Math.PI / 4 - state.Gam) * (180 / Math.PI);

      // Check if plane is off screen
      const isOffScreen = x < -100 || x > window.innerWidth + 100 ||
                          y < -100 || y > window.innerHeight + 100;

      if (isOffScreen && !offscreenTimeoutRef.current) {
        // Schedule cleanup 1 second after going offscreen
        offscreenTimeoutRef.current = setTimeout(() => {
          onComplete?.();
        }, 1000);
      }

      setPosition({ x, y, angle });
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (offscreenTimeoutRef.current) {
        clearTimeout(offscreenTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPosition, scenario, direction]);

  // Apply gusts without restarting the simulation
  useEffect(() => {
    if (gustState?.timestamp && gustState.timestamp !== lastGustTimestampRef.current && stateRef.current) {
      stateRef.current.V *= (1 + gustState.strength * 0.3);
      stateRef.current.Gam += gustState.angle;
      lastGustTimestampRef.current = gustState.timestamp;
    }
  }, [gustState]);

  if (!position) {
    return null;
  }

  // Determine scaleX based on initial direction
  const scaleX = direction === 'left' ? -1 : 1;

  return (
    <div
      className="paper-plane-animated"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `translate(-50%, -50%) scaleX(${scaleX}) rotate(${position.angle}deg)`,
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
