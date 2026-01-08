import React, { useEffect, useState, useRef } from 'react';
import { getInitialConditions } from '../utils/paperPlanePhysics';

import '../styles/paperPlane.css';

// Offscreen cleanup timing
const OFFSCREEN_CLEANUP_DELAY_MS = 10000; // 10 seconds

/**
 * Animated paper airplane component
 * Simulates realistic glide physics when triggered
 */
const PaperPlaneAnimation = ({ startPosition, onComplete, scenario = 'equilibrium', direction = 'right', gustState }) => {
  const [position, setPosition] = useState(null);
  const animationRef = useRef(null);
  const stateRef = useRef(null);
  const lastGustTimestampRef = useRef(0);
  const offscreenCheckRef = useRef(null);
  const wasOffscreenRef = useRef(false);
  const windVelocityRef = useRef({ vx: 0, vy: 0 }); // Current wind velocity affecting the plane

  // Helper functions for gust handling
  function getPlaneXPosition(state, startPosition, direction) {
    const directionMultiplier = direction === 'left' ? -1 : 1;
    return startPosition.x + state.Range * 100 * directionMultiplier;
  }

  function calculatePositionalGustEffect(gustState, planeX) {
    const distanceFromSource = Math.abs(planeX - gustState.sourceX);
    
    if (distanceFromSource > gustState.radius) {
      return null; // Plane is outside gust radius
    }

    // Inverse falloff: 100% at center, 20% at referenceDistance
    const refDist = gustState.referenceDistance || 800;
    const effectMultiplier = 1 / (1 + 4 * distanceFromSource / refDist);
    
    // Calculate wind speed (m/s)
    const windSpeed = gustState.strength * effectMultiplier * 3;
    
    return {
      vx: 0,
      vy: windSpeed, // Positive is upward
    };
  }

  function applyGlobalGust(state, gustState, lastTimestampRef) {
    if (gustState.timestamp && gustState.timestamp !== lastTimestampRef.current) {
      state.V *= (1 + gustState.strength * 0.3);
      state.Gam += gustState.angle;
      lastTimestampRef.current = gustState.timestamp;
    }
  }

  function handlePositionalGust(gustState, state, startPosition, direction, windVelocityRef) {
    const planeX = getPlaneXPosition(state, startPosition, direction);
    const windVelocity = calculatePositionalGustEffect(gustState, planeX);
    
    if (windVelocity) {
      windVelocityRef.current = windVelocity;
    } else {
      windVelocityRef.current = { vx: 0, vy: 0 };
    }
  }

  // Update wind velocity based on gusts
  useEffect(() => {
    if (!stateRef.current) return;

    if (gustState?.sourceX !== undefined && gustState.radius !== undefined) {
      // Positional gust (fan) - calculate current effect
      handlePositionalGust(
        gustState,
        stateRef.current,
        startPosition,
        direction,
        windVelocityRef
      );
    } else if (gustState?.timestamp) {
      // Global gust - instant velocity boost
      applyGlobalGust(stateRef.current, gustState, lastGustTimestampRef);
    }
  }, [gustState, direction, startPosition.x]);

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
    // --- Helper functions to break up animate ---
    function computeAirVelocity(state, wind) {
      const Vx = state.V * Math.cos(state.Gam) - wind.vx;
      const Vy = state.V * Math.sin(state.Gam) - wind.vy;
      return { Vx, Vy };
    }

    function computeLiftDrag(Vair, CLeq, CDeq) {
      const q = 0.5 * rho * Vair ** 2;
      const L = q * S * CLeq;
      const D = q * S * CDeq;
      return { L, D };
    }

    function computeForces(L, D, GamAir, m, g) {
      const Fx = -D * Math.cos(GamAir) - L * Math.sin(GamAir);
      const Fy = -D * Math.sin(GamAir) + L * Math.cos(GamAir) - m * g;
      return { Fx, Fy };
    }

    function updateVelocity(state, ax, ay, dt) {
      const Vx_ground = state.V * Math.cos(state.Gam) + ax * dt;
      const Vy_ground = state.V * Math.sin(state.Gam) + ay * dt;
      return { Vx_ground, Vy_ground };
    }

    function updateState(state, Vx_ground, Vy_ground, dt) {
      state.V = Math.sqrt(Vx_ground * Vx_ground + Vy_ground * Vy_ground);
      state.Gam = Math.atan2(Vy_ground, Vx_ground);
      state.H += Vy_ground * dt;
      state.Range += Vx_ground * dt;
    }

    function getScreenCoords(startPosition, state, initialHeight, scale, directionMultiplier) {
      const x = startPosition.x + state.Range * scale * directionMultiplier;
      const y = startPosition.y + (initialHeight - state.H) * scale;
      const angle = (Math.PI / 4 - state.Gam) * (180 / Math.PI);
      return { x, y, angle };
    }

    function checkIfOffScreen(x, y) {
      return (
        x < -100 ||
        x > window.innerWidth + 100 ||
        y < -100 ||
        y > window.innerHeight + 100
      );
    }

    const animate = () => {
      const state = stateRef.current;
      if (!state) return;

      const wind = windVelocityRef.current;

      // --- Main physics step ---

      // 1. Air relative velocity and angle
      const { Vx, Vy } = computeAirVelocity(state, wind);
      const Vair = Math.sqrt(Vx * Vx + Vy * Vy);
      const GamAir = Math.atan2(Vy, Vx);

      // 2. Lift & Drag
      const { L, D } = computeLiftDrag(Vair, CLeq, CDeq);

      // 3. Forces
      const { Fx, Fy } = computeForces(L, D, GamAir, m, g);

      // 4. Accelerations
      const ax = Fx / m;
      const ay = Fy / m;

      // 5. Update ground-relative velocities
      const { Vx_ground, Vy_ground } = updateVelocity(state, ax, ay, dt);

      // 6. Update state with new velocities
      updateState(state, Vx_ground, Vy_ground, dt);

      // 7. Convert to screen coords
      const directionMultiplier = direction === 'left' ? -1 : 1;
      const { x, y, angle } = getScreenCoords(
        startPosition,
        state,
        initialHeight,
        scale,
        directionMultiplier
      );

      // 8. Offscreen check/cleanup
      const isOffScreen = checkIfOffScreen(x, y);

      if (isOffScreen) {
        if (!wasOffscreenRef.current) {
          wasOffscreenRef.current = true;
          offscreenCheckRef.current = setTimeout(() => {
            checkAndCleanup();
          }, OFFSCREEN_CLEANUP_DELAY_MS);
        }
      } else {
        wasOffscreenRef.current = false;
        if (offscreenCheckRef.current) {
          clearTimeout(offscreenCheckRef.current);
          offscreenCheckRef.current = null;
        }
      }

      setPosition({ x, y, angle });
      animationRef.current = requestAnimationFrame(animate);
    };

    const checkAndCleanup = () => {
      if (!stateRef.current) return;

      const state = stateRef.current;
      const directionMultiplier = direction === 'left' ? -1 : 1;
      const x = startPosition.x + state.Range * scale * directionMultiplier;
      const y = startPosition.y + (initialHeight - state.H) * scale;

      const isOffScreen = x < -100 || x > window.innerWidth + 100 ||
                          y < -100 || y > window.innerHeight + 100;

      if (isOffScreen) {
        // Still offscreen after delay, clean up
        onComplete?.();
      } else {
        // Back onscreen, check again after another full delay period
        wasOffscreenRef.current = false;
        offscreenCheckRef.current = setTimeout(() => {
          checkAndCleanup();
        }, OFFSCREEN_CLEANUP_DELAY_MS);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (offscreenCheckRef.current) {
        clearTimeout(offscreenCheckRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPosition, scenario, direction]);

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
