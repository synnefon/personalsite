import { useCallback, useEffect, useRef, useState } from "react";
import fanIcon from "../assets/projects/fan.svg";
import { findSafeViewportSpot } from "../util/safeSpot";
import PaperPlaneAnimation from "./PaperPlaneAnimation";

// Fan dimensions - must match .fan-container in projects.css
const FAN_SIZE = 60;
const LONG_PRESS_DELAY_MS = 200;

// Click-anywhere paper planes, plus the fan that blows them around.
export default function PaperPlanes() {
  const [planes, setPlanes] = useState([]);
  const [gustState, setGustState] = useState({ strength: 0, angle: 0 });
  const [fanVisible, setFanVisible] = useState(false);
  const [fanSpinning, setFanSpinning] = useState(false);
  const [fanPosition, setFanPosition] = useState({ x: null, y: null }); // null means centered
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pressActive, setPressActive] = useState(false);
  const fanPositionRef = useRef({ x: null, y: null });
  const fanElementRef = useRef(null);
  const longPressTimeoutRef = useRef(null);
  const longPressMetRef = useRef(false);

  // Generate strong upward gusts when fan is spinning
  useEffect(() => {
    if (!fanSpinning) return;

    const generateFanGust = () => {
      // Get actual fan position from DOM
      let fanX, fanY;
      if (fanElementRef.current) {
        const rect = fanElementRef.current.getBoundingClientRect();
        fanX = rect.left + rect.width / 2;
        fanY = rect.top + rect.height / 2;
      } else {
        // Fallback if ref not set yet
        fanX = fanPositionRef.current.x !== null
          ? fanPositionRef.current.x
          : window.innerWidth / 2;
        fanY = fanPositionRef.current.y !== null
          ? fanPositionRef.current.y
          : window.innerHeight - 20 - FAN_SIZE / 2;
      }

      setGustState({
        strength: 1.5, // Moderate upward force (at fan center)
        angle: 0, // Not used with physics-based wind
        timestamp: Date.now(),
        sourceX: fanX, // X position of the gust source
        sourceY: fanY, // Y position of the gust source
        radius: FAN_SIZE, // Column extends full fan width on each side
        referenceDistance: window.innerHeight, // Distance at which effect is 20%
      });
    };

    // Generate gusts continuously while spinning
    const interval = setInterval(generateFanGust, 100);

    return () => clearInterval(interval);
  }, [fanSpinning]);

  const handleFanClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (!hasDragged) {
        setFanSpinning((prev) => !prev);
      }
      setHasDragged(false);
    },
    [hasDragged]
  );

  const handleFanMouseDown = useCallback((e) => {
    e.stopPropagation();
    setHasDragged(false);
    setPressActive(true);
    longPressMetRef.current = false;

    // Calculate offset from fan center to mouse
    const fanElement = e.currentTarget;
    const rect = fanElement.getBoundingClientRect();
    const fanCenterX = rect.left + rect.width / 2;
    const fanCenterY = rect.top + rect.height / 2;

    setDragOffset({
      x: e.clientX - fanCenterX,
      y: e.clientY - fanCenterY,
    });

    // Mark long press threshold met after delay
    longPressTimeoutRef.current = setTimeout(() => {
      longPressMetRef.current = true;
      longPressTimeoutRef.current = null;
    }, LONG_PRESS_DELAY_MS);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      // Only drag if long press threshold met
      if (!longPressMetRef.current) return;

      if (!isDragging) {
        setIsDragging(true);
      }

      setHasDragged(true);
      // Anchor to page coordinates so the fan stays put when scrolling
      const scroller = document.getElementById("app-base");
      const scrollTop = scroller ? scroller.scrollTop : 0;
      const newPosition = {
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y + scrollTop,
      };
      setFanPosition(newPosition);
      fanPositionRef.current = newPosition;
    },
    [isDragging, dragOffset]
  );

  const handleMouseUp = useCallback(() => {
    // Clear long press timeout if still pending
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    longPressMetRef.current = false;
    setPressActive(false);
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (pressActive) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [pressActive, handleMouseMove, handleMouseUp]);

  // Cleanup long press timeout on unmount
  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  const handlePageClick = useCallback(
    (e) => {
      // Ignore clicks on interactive elements
      const isInteractive = e.target.closest(
        "a, .link, button, .audio-fact, .duck-container, #person-icon, .me-fact-wrapper, .fan-container, .navbar, .social-icons"
      );
      if (isInteractive) return;

      // Get click position
      const clickPosition = {
        x: e.clientX,
        y: e.clientY,
      };

      // Determine direction: fly towards the further side
      // If click is on left half, fly right; if on right half, fly left
      const screenMidpoint = window.innerWidth / 2;
      const direction = clickPosition.x < screenMidpoint ? "right" : "left";

      // Add new plane to the list
      const newPlane = {
        id: Date.now(),
        startPosition: clickPosition,
        direction,
      };

      setPlanes((prev) => {
        const updatedPlanes = [...prev, newPlane];
        // Show fan after 2+ planes, somewhere safe in the current view
        if (updatedPlanes.length >= 2 && !fanVisible) {
          setFanVisible(true);
          const spot = findSafeViewportSpot({ size: FAN_SIZE });
          if (spot.top !== null) {
            const scroller = document.getElementById("app-base");
            const scrollTop = scroller ? scroller.scrollTop : 0;
            const position = {
              x: spot.left + FAN_SIZE / 2,
              y: spot.top + scrollTop + FAN_SIZE / 2,
            };
            setFanPosition(position);
            fanPositionRef.current = position;
          }
        }
        return updatedPlanes;
      });
    },
    [fanVisible]
  );

  // Fire planes from anywhere on the page
  useEffect(() => {
    document.addEventListener("click", handlePageClick);
    return () => document.removeEventListener("click", handlePageClick);
  }, [handlePageClick]);

  const handleAnimationComplete = useCallback((planeId) => {
    setPlanes((prev) => prev.filter((p) => p.id !== planeId));
  }, []);

  return (
    <>
      {/* Render all active paper planes */}
      {planes.map((plane) => (
        <PaperPlaneAnimation
          key={plane.id}
          startPosition={plane.startPosition}
          direction={plane.direction}
          gustState={gustState}
          onComplete={() => handleAnimationComplete(plane.id)}
        />
      ))}

      {/* Fan appears at bottom after 2+ planes fired */}
      {fanVisible && (
        <div
          ref={fanElementRef}
          className={`fan-container ${fanSpinning ? "spinning" : ""} ${
            isDragging ? "dragging" : ""
          }`}
          style={
            fanPosition.x !== null && fanPosition.y !== null
              ? {
                  width: `${FAN_SIZE}px`,
                  height: `${FAN_SIZE}px`,
                  left: `${fanPosition.x}px`,
                  top: `${fanPosition.y}px`,
                  bottom: "auto",
                  transform: "translate(-50%, -50%)",
                }
              : {
                  width: `${FAN_SIZE}px`,
                  height: `${FAN_SIZE}px`,
                }
          }
          onClick={handleFanClick}
          onMouseDown={handleFanMouseDown}
        >
          <img src={fanIcon} alt="fan" className="fan-icon" draggable={false} />
        </div>
      )}
    </>
  );
}
