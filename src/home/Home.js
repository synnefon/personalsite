import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { TypeAnimation } from "react-type-animation";

import duckIcon from "../assets/nav_icons/duck.svg";
import { playRandom8BitSound } from "../utils/eightBitSynth";
import "../styles/app.css";
import "../styles/home.css";

export default function Home() {
  const [duckOrange, setDuckOrange] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duckPosition, setDuckPosition] = useState(() => {
    const saved = sessionStorage.getItem('duckPosition');
    return saved ? JSON.parse(saved) : { left: 30, top: null, bottom: 10 };
  });
  const soundStopRef = useRef(null);
  const contentWrapperRef = useRef(null);

  // const [color, setColor] = useState(COLORS[0]);
  // // const maxX = useRef(window.innerWidth);
  // const maxY = useRef(window.innerHeight);

  // const onMouseMove = useCallback(
  //   (e) => {
  //     if (maxY.current > 0) {
  //       // const percentX = e.clientX / maxX.current;
  //       const percentY = e.clientY / maxY.current;
  //       // const average = (percentX + percentY) / 2;

  //       setColor(interpolateColor(COLORS[0], COLORS[1], percentY));
  //     }
  //   },
  //   []
  // );

  // const onResize = () => {
  //   // maxX.current = window.innerWidth;
  //   maxY.current = window.innerHeight;
  // };

  // useEffect(() => {
  //   window.addEventListener("mousemove", onMouseMove);
  //   window.addEventListener("resize", onResize);
  //   return () => window.removeEventListener("mousemove", onMouseMove);
  // }, [onMouseMove]);

  const descriptors = [
    "software engineer",
    "amateur wood worker",
    "dungeon master",
    "rock climber",
    "cat dad",
    "3d printer mechanic",
    "bike lane survivor",
    ["mildly dysleixc", "mildly dyslexic"],
    "magic player",
    "part-time audiophile",
    "full-time wikipedia spelunker",
    "human band name generator",
    "lava lamp enthusiast",
    "lower case advocate",
    "secretly a gnome",
    "the ignoble",
    "bug fact purveyor",
    "list writer",
    "rumored fictional character",
    "have i mentioned software engineer already?",
    "   ",
    "...pls look at projects",
    "...or just click on any link",
    "is running out of autobiographical subheadings",
    "   ",
  ];

  useEffect(() => {
    document.getElementById("app-base").setAttribute("class", "");
  }, []);

  // Save duck position to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('duckPosition', JSON.stringify(duckPosition));
  }, [duckPosition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundStopRef.current) {
        soundStopRef.current();
      }
    };
  }, []);

  const calculateSafePosition = (currentPos) => {
    const duckSize = 72;
    const navbarSafeZone = { width: 200, height: 200 }; // Avoid top-left navbar area
    const margin = 20; // Minimum margin from edges
    const minDistance = 150; // Minimum distance from current position

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Get current position coordinates
    const currentX = currentPos.left !== null ? currentPos.left : windowWidth - duckSize - margin;
    const currentY = currentPos.top !== null ? currentPos.top : windowHeight - (currentPos.bottom || margin) - duckSize;

    // Get content wrapper bounds
    let contentBounds = null;
    if (contentWrapperRef.current) {
      const rect = contentWrapperRef.current.getBoundingClientRect();
      contentBounds = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    }

    // Generate random position until we find a safe one
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const left = margin + Math.random() * (windowWidth - duckSize - 2 * margin);
      const top = margin + Math.random() * (windowHeight - duckSize - 2 * margin);

      // Calculate distance from current position
      const distance = Math.sqrt(Math.pow(left - currentX, 2) + Math.pow(top - currentY, 2));

      // Check if position overlaps with navbar (top-left)
      const overlapsNavbar = left < navbarSafeZone.width && top < navbarSafeZone.height;

      // Check if position overlaps with content wrapper
      let overlapsContent = false;
      if (contentBounds) {
        overlapsContent = !(
          left + duckSize < contentBounds.left ||
          left > contentBounds.right ||
          top + duckSize < contentBounds.top ||
          top > contentBounds.bottom
        );
      }

      if (!overlapsNavbar && !overlapsContent && distance >= minDistance) {
        return { left, top, bottom: null };
      }

      attempts++;
    }

    // Fallback: place in bottom-right corner
    return {
      left: windowWidth - duckSize - margin,
      top: null,
      bottom: margin,
    };
  };

  const handleClick = () => {
    // Prevent new inputs while already playing
    if (isPlaying) return;

    // Move duck to random position
    setDuckPosition(calculateSafePosition(duckPosition));

    // Start playing sound
    setIsPlaying(true);
    const stopSound = playRandom8BitSound();
    soundStopRef.current = stopSound;

    // Stop after 1 second
    setTimeout(() => {
      setIsPlaying(false);
      if (soundStopRef.current) {
        soundStopRef.current();
        soundStopRef.current = null;
      }
    }, 1000);
  };

  const extractDescription = (descriptor) =>
    descriptor.constructor === Array
      ? [descriptor[0], 500, descriptor[1], 3_500]
      : [descriptor, 3_000];

  return (
    <div
      id="app-base"
      className="home-colors"
      // style={{
      //   "--bg-color": color,
      //   "--inv-text-color": color,
      // }}
    >
      <div className="content-wrapper home-colors" ref={contentWrapperRef}>
        <div className="header-line home-vertical">
          <h2 className="title">connor hopkins</h2>
          <h5 className="description home-colors home-subtitle">
            {/* <span className="bracket home-colors">{'{'}&nbsp;</span> */}
            <TypeAnimation
              className="description-text home-colors"
              sequence={descriptors.flatMap((d) => extractDescription(d))}
              wrapper="span"
              deletionSpeed={60}
              repeat={Infinity}
              cursor={false}
            />
            {/* <span className="bracket home-colors">{"}"}</span> */}
          </h5>
        </div>
        <div className="links home-colors">
          <Link
            className="link top left home-colors"
            to="/projects"
            rel="noreferrer"
          >
            <p className="link-text home-colors">projects</p>
            <p className="tooltip-text home-colors">
              an assortment of web-accessible work
            </p>
          </Link>
          <Link
            className="link about home-colors top right"
            to="/about"
            rel="noreferrer"
          >
            <p className="link-text home-colors">about</p>
            <p className="tooltip-text home-colors">
              $ whois connorhopkins.xyz
            </p>
          </Link>
          <a
            className="link bottom left home-colors"
            href="https://www.linkedin.com/in/connor-j-hopkins"
            rel="noreferrer"
          >
            <p className="link-text home-colors">linkedin</p>
            <p className="tooltip-text home-colors">let's network!</p>
          </a>
          <a
            className="link resume middle left home-colors"
            href="https://docs.google.com/document/d/1A77LelAqhLE98pvkOYpHjUAs7l3LW-mcSQr-_MpbP6I"
            rel="noreferrer"
          >
            <p className="link-text home-colors">resume</p>
            <p className="tooltip-text home-colors">
              the list of stuff i've done professionally
            </p>
          </a>
          <a
            className="link middle right home-colors"
            href="https://github.com/synnefon"
            rel="noreferrer"
          >
            <p className="link-text home-colors">github</p>
            <p className="tooltip-text home-colors">
              where you can see some code i've written
            </p>
          </a>
          {/* <a
            className="link bottom right home-colors"
            href="mailto:connorjhopkins@gmail.com?subject=let's%20collab!%20"
          >
            <p className="link-text home-colors">get in touch</p>
            <p className="tooltip-text home-colors">shoot me an email</p>
          </a> */}
        </div>
      </div>

      {/* Duck SVG */}
      <div
        className={`duck-container ${isPlaying ? 'wiggle' : ''}`}
        style={{
          left: duckPosition.left !== null ? `${duckPosition.left}px` : 'auto',
          top: duckPosition.top !== null ? `${duckPosition.top}px` : 'auto',
          bottom: duckPosition.bottom !== null ? `${duckPosition.bottom}px` : 'auto',
        }}
        onMouseEnter={() => setDuckOrange(true)}
        onMouseLeave={() => setDuckOrange(false)}
        onClick={handleClick}
      >
        <img
          src={duckIcon}
          alt="duck"
          draggable={false}
          className={`duck-icon ${duckOrange || isPlaying ? 'orange' : ''}`}
        />
      </div>
    </div>
  );
}
