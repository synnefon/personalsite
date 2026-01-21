import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import fanIcon from "../assets/projects/fan.svg";
import PaperPlaneAnimation from "./PaperPlaneAnimation";

import "../styles/app.css";
import "../styles/projects.css";

// Fan dimensions - must match .fan-container in projects.css
const FAN_SIZE = 60;
const LONG_PRESS_DELAY_MS = 200;

export default function Projects() {
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

  // No random gusts - only fan-generated wind

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
      const newPosition = {
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
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
      // Check if click is on a link or inside a link
      const isLink = e.target.closest("a") || e.target.closest(".link");
      if (isLink) return;

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
        // Show fan after 2+ planes
        if (updatedPlanes.length >= 2 && !fanVisible) {
          setFanVisible(true);
        }
        return updatedPlanes;
      });
    },
    [fanVisible]
  );

  const handleAnimationComplete = useCallback((planeId) => {
    setPlanes((prev) => prev.filter((p) => p.id !== planeId));
  }, []);

  return (
    <div
      id="app-base"
      className="proj-colors paper-plane-cursor"
      onClick={handlePageClick}
    >
      <div className="content-wrapper proj-colors">
        <div className="header-line">
          <h2 className="title proj-colors">projects</h2>
        </div>
        <div className="links proj-colors">
          <a
            className="link proj-colors"
            href="https://synnefon.github.io/mapinator"
            rel="noreferrer"
          >
            <p className="link-text proj-colors">mapinator</p>
            <p className="tooltip-text proj-colors">
              procedural terrain map generator
            </p>
          </a>
          <Link
            className="link proj-colors"
            to="/game-of-life"
            rel="noreferrer"
          >
            <p className="link-text proj-colors">game of life</p>
            <p className="tooltip-text proj-colors">
              cellular automata simulator
            </p>
          </Link>
          <Link
            className="link proj-colors"
            to="/lava-lamp-radio"
            rel="noreferrer"
          >
            <p className="link-text proj-colors">lava lamp radio</p>
            <p className="tooltip-text proj-colors">
              pixelated cellular automata lava lamp radio
            </p>
          </Link>
          <Link className="link proj-colors" to="/shavianator" rel="noreferrer">
            <p className="link-text proj-colors">shavian transliterator</p>
            <p className="tooltip-text proj-colors">english → shavian</p>
          </Link>
          {
            <Link className="link proj-colors" to="/snek" rel="noreferrer">
              <p className="link-text proj-colors">snek</p>
              <p className="tooltip-text proj-colors">snek!</p>
            </Link>
          }

          <Link className="link proj-colors" to="/sudoku" rel="noreferrer">
            <p className="link-text proj-colors">sudoku</p>
            <p className="tooltip-text proj-colors">eternal classic</p>
          </Link>
          <Link
            className="link proj-colors"
            to="/shufflenator"
            rel="noreferrer"
          >
            <p className="link-text proj-colors">shufflenator</p>
            <p className="tooltip-text proj-colors">
              optimal shuffle pattern calculator
            </p>
          </Link>
          {/* <Link className="link proj-colors" to="/matchgame" rel="noreferrer">
            <p className="link-text proj-colors">sea match</p>
            <p className="tooltip-text proj-colors">a sea-themed memory game</p>
          </Link> */}
          <a
            className="link proj-colors"
            href="https://thangs.com/designer/synnefon"
            rel="noreferrer"
          >
            <p className="link-text proj-colors">3d models</p>
            <p className="tooltip-text proj-colors">
              collection of my 3d-printable work
            </p>
          </a>
          <a
            className="link proj-colors"
            href="https://www.npmjs.com/package/img-butler"
            rel="noreferrer"
          >
            <p className="link-text proj-colors">img-butler</p>
            <p className="tooltip-text proj-colors">
              image interaction npm package
            </p>
          </a>
          <a
            className="link proj-colors"
            href="https://github.com/synnefon/spagett"
            rel="noreferrer"
          >
            <p className="link-text proj-colors">spagett ql</p>
            <p className="tooltip-text proj-colors">
              lisp-like query language. al dente.{" "}
            </p>
          </a>
          {/* <Link className="link proj-colors" to="/wip" rel="noreferrer">
            <p className="link-text proj-colors">work in progress</p>
            <p className="tooltip-text proj-colors">coming soon to a website near you</p>
          </Link> */}
          {/* <Link className="link proj-colors" to="/toolbox" rel="noreferrer">
            <p className="link-text proj-colors">toolbox</p>
            <p className="tooltip-text proj-colors">various utilities</p>
          </Link> */}
          {/* <Link className="link proj-colors" to="/wip" rel="noreferrer">
            <p className="link-text proj-colors">rpg tabletop</p>
            <p className="tooltip-text proj-colors">real-time updating battle maps, world maps, and images</p>
          </Link> */}
          {/* <Link className="link proj-colors" to="/wip" rel="noreferrer">
            <p className="link-text proj-colors">infinite terrain</p>
            <p className="tooltip-text proj-colors">a godot module that generates infinite terrains</p>
          </Link> */}
        </div>
        {/* <Raincloud showLightning={showLightning} setShowLightning={setShowLightning}/> */}
      </div>

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
    </div>
  );
}
