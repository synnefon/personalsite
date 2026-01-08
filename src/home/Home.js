import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { TypeAnimation } from "react-type-animation";

import duckIcon from "../assets/nav_icons/duck.svg";
import quackSound from "../assets/home/quack.wav";
import { playRandom8BitSound, playPopSound } from "../utils/eightBitSynth";
import "../styles/app.css";
import "../styles/home.css";

// Sound and animation timing constants (single source of truth)
const SOUND_DURATION_MS = 1300;
const MAX_VOLUME_MULTIPLIER = 3;
const NUM_ARPEGGIO_STEPS = 5;
const VOLUME_INCREMENT = (MAX_VOLUME_MULTIPLIER - 1) / (NUM_ARPEGGIO_STEPS - 1);

export default function Home() {
  const [duckOrange, setDuckOrange] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duckVisible, setDuckVisible] = useState(true);
  const [duckPosition, setDuckPosition] = useState(() => {
    const saved = sessionStorage.getItem('duckPosition');
    if (saved) {
      return JSON.parse(saved);
    }
    // Convert initial bottom position to top on first load
    const windowHeight = window.innerHeight;
    const duckSize = 72;
    return { left: 30, top: windowHeight - 10 - duckSize, bottom: null };
  });
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const soundStopRef = useRef(null);
  const soundParamsRef = useRef(null);
  const contentWrapperRef = useRef(null);
  const timeoutRef = useRef(null);

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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
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

    // Get current position coordinates (always use top-based)
    const currentX = currentPos.left;
    const currentY = currentPos.top;

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
    // Check if we should replay the same sound (either playing or within buffer period)
    const shouldReplaySameSound = isPlaying || soundParamsRef.current !== null;
    let newVolumeMultiplier = volumeMultiplier;
    let soundParams = null;

    if (shouldReplaySameSound) {
      // Check if this is the 6th click (already at max volume)
      if (volumeMultiplier >= MAX_VOLUME_MULTIPLIER) {
        // Play quack sound and hide the duck
        playPopSound(quackSound);
        setDuckVisible(false);
        // Clear saved position so duck resets to original position on next page load
        sessionStorage.removeItem('duckPosition');
        // Reset all state
        setIsPlaying(false);
        setVolumeMultiplier(1);
        soundParamsRef.current = null;
        if (soundStopRef.current) {
          soundStopRef.current();
          soundStopRef.current = null;
        }
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        return;
      }

      // Cancel current sound if playing
      if (soundStopRef.current) {
        soundStopRef.current();
        soundStopRef.current = null;
      }
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Increase volume multiplier
      newVolumeMultiplier = Math.min(volumeMultiplier + VOLUME_INCREMENT, MAX_VOLUME_MULTIPLIER);
      setVolumeMultiplier(newVolumeMultiplier);
      // Reuse the same sound parameters
      soundParams = soundParamsRef.current;
    } else {
      // Reset volume multiplier and sound params on first click
      newVolumeMultiplier = 1;
      setVolumeMultiplier(1);
      soundParamsRef.current = null;
    }

    // Move duck to random position
    setDuckPosition(calculateSafePosition(duckPosition));

    // Start playing sound with current volume multiplier, params, and arpeggio step
    // arpeggioStep is 0-indexed: volume 1.0→step 0, 1.5→step 1, 2.0→step 2, 2.5→step 3, 3.0→step 4
    const arpeggioStep = Math.round((newVolumeMultiplier - 1) / VOLUME_INCREMENT);
    setIsPlaying(true);
    const sound = playRandom8BitSound(newVolumeMultiplier, soundParams, arpeggioStep);
    soundStopRef.current = sound.stop;
    soundParamsRef.current = sound.params;

    // Keep wiggling, sound playing, and params alive for full duration
    timeoutRef.current = setTimeout(() => {
      setIsPlaying(false);
      setVolumeMultiplier(1);
      soundParamsRef.current = null;
      if (soundStopRef.current) {
        soundStopRef.current();
        soundStopRef.current = null;
      }
      timeoutRef.current = null;
    }, SOUND_DURATION_MS);
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
      {duckVisible && (
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
      )}
    </div>
  );
}
