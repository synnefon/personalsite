import { useCallback, useEffect, useRef, useState } from "react";
import fanIcon from "../assets/projects/fan.svg";
import { findSafeViewportSpot } from "../util/safeSpot";
import { calculateCoordinateScale } from "./paperPlanePhysics";
import PaperPlaneAnimation, { PaperPlaneIcon } from "./PaperPlaneAnimation";

// Fan dimensions - must match .fan-container in projects.css
const FAN_SIZE = 60;
const LONG_PRESS_DELAY_MS = 200;

// Throw tuning: mouse velocity is sampled over a trailing window
const VELOCITY_WINDOW_MS = 120;
const MIN_SAMPLE_SPAN_MS = 30;
const DRAG_THRESHOLD_PX = 6;
const MIN_THROW_SPEED_PX_PER_SEC = 50;

// Press-and-drag paper planes, plus the fan that blows them around.
// Pressing picks up a plane (the cursor becomes it), releasing throws
// it with the mouse's velocity; a plain click just drops it.
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
  const [holding, setHolding] = useState(false);
  const [heldPos, setHeldPos] = useState(null);
  const fanPositionRef = useRef({ x: null, y: null });
  const fanElementRef = useRef(null);
  const longPressTimeoutRef = useRef(null);
  const longPressMetRef = useRef(false);
  const throwSamplesRef = useRef([]);
  const holdStartRef = useRef({ x: 0, y: 0 });
  const holdDraggedRef = useRef(false);

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

  // --- Plane hold / throw ---

  const beginHold = useCallback((x, y) => {
    throwSamplesRef.current = [{ x, y, t: performance.now() }];
    holdStartRef.current = { x, y };
    holdDraggedRef.current = false;
    setHeldPos({ x, y });
    setHolding(true);
  }, []);

  const catchPlane = useCallback(
    (planeId, x, y) => {
      setPlanes((prev) => prev.filter((p) => p.id !== planeId));
      beginHold(x, y);
    },
    [beginHold]
  );

  const throwPlane = useCallback(
    (x, y, vx, vy) => {
      let direction;
      let initial;
      if (Math.hypot(vx, vy) < MIN_THROW_SPEED_PX_PER_SEC) {
        // A plain click or a still release: just drop the plane
        direction = "right";
        initial = { V: 0, Gam: 0 };
      } else {
        // Screen px/s -> sim m/s; sim y is up, and horizontal speed
        // folds into the direction multiplier
        const scale = calculateCoordinateScale(window.innerWidth);
        direction = vx >= 0 ? "right" : "left";
        const simVx = Math.abs(vx) / scale;
        const simVy = -vy / scale;
        initial = { V: Math.hypot(simVx, simVy), Gam: Math.atan2(simVy, simVx) };
      }

      const newPlane = {
        id: Date.now(),
        startPosition: { x, y },
        direction,
        initial,
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

  const handleHoldMove = useCallback((e) => {
    const t = performance.now();
    const samples = throwSamplesRef.current;
    samples.push({ x: e.clientX, y: e.clientY, t });
    while (samples.length && t - samples[0].t > VELOCITY_WINDOW_MS) {
      samples.shift();
    }
    const start = holdStartRef.current;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_THRESHOLD_PX) {
      holdDraggedRef.current = true;
    }
    setHeldPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleHoldUp = useCallback(
    (e) => {
      setHolding(false);
      setHeldPos(null);
      let vx = 0;
      let vy = 0;
      if (holdDraggedRef.current) {
        const t = performance.now();
        const samples = throwSamplesRef.current;
        // Only trust fresh samples: a parked mouse is a drop, not a
        // slow throw averaged across the whole hold
        const reference = samples.find((s) => t - s.t <= VELOCITY_WINDOW_MS);
        if (reference && t - reference.t >= MIN_SAMPLE_SPAN_MS) {
          const dt = (t - reference.t) / 1000;
          vx = (e.clientX - reference.x) / dt;
          vy = (e.clientY - reference.y) / dt;
        }
      }
      throwPlane(e.clientX, e.clientY, vx, vy);
    },
    [throwPlane]
  );

  useEffect(() => {
    if (!holding) return;
    window.addEventListener("mousemove", handleHoldMove);
    window.addEventListener("mouseup", handleHoldUp);
    return () => {
      window.removeEventListener("mousemove", handleHoldMove);
      window.removeEventListener("mouseup", handleHoldUp);
    };
  }, [holding, handleHoldMove, handleHoldUp]);

  const handlePageMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      // Ignore presses on interactive elements
      const isInteractive = e.target.closest(
        "a, .link, button, .audio-fact, .duck-container, #person-icon, .me-fact-wrapper, .fan-container, .navbar, .social-icons"
      );
      if (isInteractive) return;
      // Ignore presses on the scrollbar (clientWidth excludes it)
      const scroller = document.getElementById("app-base");
      if (
        scroller &&
        e.clientX >= scroller.getBoundingClientRect().left + scroller.clientWidth
      ) {
        return;
      }
      beginHold(e.clientX, e.clientY);
    },
    [beginHold]
  );

  // Pick up a fresh plane from anywhere on the page
  useEffect(() => {
    document.addEventListener("mousedown", handlePageMouseDown);
    return () => document.removeEventListener("mousedown", handlePageMouseDown);
  }, [handlePageMouseDown]);

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
          initialState={plane.initial}
          gustState={gustState}
          onCatch={(pos) => catchPlane(plane.id, pos.x, pos.y)}
          onComplete={() => handleAnimationComplete(plane.id)}
        />
      ))}

      {/* While holding, the plane rides with the mouse under a grabbing cursor */}
      {holding && heldPos && (
        <>
          <div
            className="paper-plane-held"
            style={{ left: `${heldPos.x}px`, top: `${heldPos.y}px` }}
          >
            <PaperPlaneIcon />
          </div>
          <div className="plane-hold-overlay" />
        </>
      )}

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
