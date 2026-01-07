import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PaperPlaneAnimation from "../components/PaperPlaneAnimation";

import "../styles/app.css";
import "../styles/projects.css";

export default function Projects() {
  const [planes, setPlanes] = useState([]);
  const [gustState, setGustState] = useState({ strength: 0, angle: 0 });

  // Generate gusts that affect all planes
  useEffect(() => {
    const generateGust = () => {
      const gustStrength = 0.3 + Math.random() * 0.7; // 0.3 to 1.0
      const gustAngle = (Math.random() - 0.5) * 0.3; // ±0.15 radians

      setGustState({
        strength: gustStrength,
        angle: gustAngle,
        timestamp: Date.now(),
      });

      // Schedule next gust (1.5 to 4 seconds later)
      const nextGustDelay = (Math.random() * 2.5 + 1.5) * 1000;
      return setTimeout(generateGust, nextGustDelay);
    };

    // Start first gust after 0.5-2.5 seconds
    const firstGustDelay = (Math.random() * 2 + 0.5) * 1000;
    const timeout = setTimeout(generateGust, firstGustDelay);

    return () => clearTimeout(timeout);
  }, []);

  const handlePageClick = useCallback((e) => {
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

    // Random scenario selection for variety
    const scenarios = ["equilibrium", "zero-angle", "fast"];
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

    // Add new plane to the list
    const newPlane = {
      id: Date.now(),
      startPosition: clickPosition,
      scenario,
      direction,
    };

    setPlanes((prev) => [...prev, newPlane]);
  }, []);

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
          scenario={plane.scenario}
          direction={plane.direction}
          gustState={gustState}
          onComplete={() => handleAnimationComplete(plane.id)}
        />
      ))}
    </div>
  );
}
