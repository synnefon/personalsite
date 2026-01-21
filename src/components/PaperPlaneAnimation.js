import React, { useEffect, useRef, useState } from "react";
import {
  ANGLE_OFFSET_RADIANS,
  calculateCoordinateScale,
  getInitialConditions,
  RADIANS_TO_DEGREES,
  updatePhysicsState,
} from "../utils/paperPlanePhysics";

import "../styles/paperPlane.css";

// Offscreen cleanup timing
const OFFSCREEN_CLEANUP_DELAY_MS = 10000; // 10 seconds

// Direction multipliers
const DIRECTION_LEFT = -1;
const DIRECTION_RIGHT = 1;

// Gust effect constants
const DEFAULT_GUST_REFERENCE_DISTANCE = 800;
const WIND_SPEED_MULTIPLIER = 3;
const GLOBAL_GUST_STRENGTH_MULTIPLIER = 0.3;

// Offscreen detection buffer (pixels)
const OFFSCREEN_BUFFER = 100;

// UI constants
const TRANSLATE_OFFSET = "-50%";
const PLANE_Z_INDEX = 9999;
const PLANE_ICON_SIZE = "32px";
const PLANE_SHADOW = "drop-shadow(0 2px 4px rgba(0,0,0,0.2))";

/**
 * Animated paper airplane component
 * Simulates realistic glide physics when triggered
 */
const PaperPlaneAnimation = ({
  startPosition,
  onComplete,
  direction = "right",
  gustState,
}) => {
  const [position, setPosition] = useState(null);
  const animationRef = useRef(null);
  const stateRef = useRef(null);
  const scaleRef = useRef(null);
  const lastGustTimestampRef = useRef(0);
  const offscreenCheckRef = useRef(null);
  const wasOffscreenRef = useRef(false);
  const windVelocityRef = useRef({ vx: 0, vy: 0 }); // Current wind velocity affecting the plane

  // Helper functions for gust handling
  function getPlaneXPosition(state, startPosition, direction) {
    const directionMultiplier =
      direction === "left" ? DIRECTION_LEFT : DIRECTION_RIGHT;
    return (
      startPosition.x + state.Range * scaleRef.current * directionMultiplier
    );
  }

  function getPlaneYPosition(state, startPosition) {
    // state.H is altitude change: negative = descended, positive = ascended
    return startPosition.y - state.H * scaleRef.current;
  }

  function calculatePositionalGustEffect(gustState, planeX, planeY) {
    // Check horizontal distance - must be within column radius
    const horizontalDistance = Math.abs(planeX - gustState.sourceX);

    if (horizontalDistance > gustState.radius) {
      return null; // Plane is outside gust column
    }

    // Calculate vertical distance from fan (both above and below)
    const verticalDistance = Math.abs(planeY - gustState.sourceY);

    // Inverse falloff based on vertical distance: 100% at fan, 50% at referenceDistance away
    const refDist =
      gustState.referenceDistance || DEFAULT_GUST_REFERENCE_DISTANCE;
    const effectMultiplier = 1 / (1 + verticalDistance / refDist);

    // Calculate wind speed (m/s)
    const windSpeed =
      gustState.strength * effectMultiplier * WIND_SPEED_MULTIPLIER;

    return {
      vx: 0,
      vy: windSpeed, // Positive is upward
    };
  }

  function applyGlobalGust(state, gustState, lastTimestampRef) {
    if (
      gustState.timestamp &&
      gustState.timestamp !== lastTimestampRef.current
    ) {
      state.V *= 1 + gustState.strength * GLOBAL_GUST_STRENGTH_MULTIPLIER;
      state.Gam += gustState.angle;
      lastTimestampRef.current = gustState.timestamp;
    }
  }

  function handlePositionalGust(
    gustState,
    state,
    startPosition,
    direction,
    windVelocityRef
  ) {
    const planeX = getPlaneXPosition(state, startPosition, direction);
    const planeY = getPlaneYPosition(state, startPosition);
    const windVelocity = calculatePositionalGustEffect(
      gustState,
      planeX,
      planeY
    );

    if (windVelocity) {
      windVelocityRef.current = windVelocity;
    } else {
      windVelocityRef.current = { vx: 0, vy: 0 };
    }
  }

  // Update wind velocity based on gusts
  useEffect(() => {
    if (!stateRef.current) return;

    if (
      gustState?.sourceX !== undefined &&
      gustState?.sourceY !== undefined &&
      gustState.radius !== undefined
    ) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gustState, direction, startPosition.x, startPosition.y]);

  useEffect(() => {
    if (!startPosition) return;

    // Initialize simulation state
    const initialConditions = getInitialConditions();
    stateRef.current = { ...initialConditions };

    // Calculate scale based on current screen width for consistent relative speed
    const scale = calculateCoordinateScale(window.innerWidth);
    scaleRef.current = scale;

    function getScreenCoords(
      startPosition,
      state,
      scale,
      directionMultiplier
    ) {
      const x = startPosition.x + state.Range * scale * directionMultiplier;
      // state.H is altitude change: negative = descended, positive = ascended
      const y = startPosition.y - state.H * scale;
      const angle = (ANGLE_OFFSET_RADIANS - state.Gam) * RADIANS_TO_DEGREES;
      return { x, y, angle };
    }

    function checkIfOffScreen(x, y) {
      return (
        x < -OFFSCREEN_BUFFER ||
        x > window.innerWidth + OFFSCREEN_BUFFER ||
        y < -OFFSCREEN_BUFFER ||
        y > window.innerHeight + OFFSCREEN_BUFFER
      );
    }

    const animate = () => {
      const state = stateRef.current;
      if (!state) return;

      const wind = windVelocityRef.current;

      // Update physics state
      updatePhysicsState(state, wind);

      // 7. Convert to screen coords
      const directionMultiplier =
        direction === "left" ? DIRECTION_LEFT : DIRECTION_RIGHT;
      const { x, y, angle } = getScreenCoords(
        startPosition,
        state,
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
      const directionMultiplier =
        direction === "left" ? DIRECTION_LEFT : DIRECTION_RIGHT;
      const x = startPosition.x + state.Range * scale * directionMultiplier;
      const y = startPosition.y - state.H * scale;

      const isOffScreen =
        x < -OFFSCREEN_BUFFER ||
        x > window.innerWidth + OFFSCREEN_BUFFER ||
        y < -OFFSCREEN_BUFFER ||
        y > window.innerHeight + OFFSCREEN_BUFFER;

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
  }, [startPosition, direction]);

  if (!position) {
    return null;
  }

  // Determine scaleX based on initial direction
  const scaleX = direction === "left" ? DIRECTION_LEFT : DIRECTION_RIGHT;

  return (
    <div
      className="paper-plane-animated"
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `translate(${TRANSLATE_OFFSET}, ${TRANSLATE_OFFSET}) scaleX(${scaleX}) rotate(${position.angle}deg)`,
        pointerEvents: "none",
        zIndex: PLANE_Z_INDEX,
        transition: "none",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="paper-plane-icon"
        style={{
          width: PLANE_ICON_SIZE,
          height: PLANE_ICON_SIZE,
          filter: PLANE_SHADOW,
          fill: "currentColor",
        }}
      >
        <path d="M1.77,6.215A2.433,2.433,0,0,0,0,8.611a2.474,2.474,0,0,0,.771,1.71L4,13.548V20h6.448l3.265,3.267a2.4,2.4,0,0,0,1.706.713,2.438,2.438,0,0,0,.618-.08,2.4,2.4,0,0,0,1.726-1.689L24-.016ZM3.533,8.856l13.209-3.7L7,14.9V12.326Zm11.6,11.6L11.675,17H9.1l9.734-9.741Z" />
      </svg>
    </div>
  );
};

export default PaperPlaneAnimation;
