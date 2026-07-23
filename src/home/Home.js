import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import Self from "../about/Self";
import AsciiTree, { types } from "../components/AsciiTree";
import PaperPlanes from "../projects/PaperPlanes";
import { findSafeViewportSpot } from "../util/safeSpot";
import quackSound from "../assets/home/quack.wav";
import curiosityAudio from "../assets/about/voices/strengths/curiosity.m4a";
import strategicThinkingAudio from "../assets/about/voices/strengths/strategic-thinking.m4a";
import jumpInAudio from "../assets/about/voices/strengths/jump-in.m4a";
import empathyAudio from "../assets/about/voices/strengths/empathy.m4a";
import perfectionisticStreakAudio from "../assets/about/voices/weaknesses/perfectionistic-streak.m4a";
import impatienceAudio from "../assets/about/voices/weaknesses/impatience-with-beaurocracy.m4a";
import milkProductsAudio from "../assets/about/voices/weaknesses/milk-products.m4a";
import "../styles/app.css";
import "../styles/home.css";
import "../styles/projects.css";
import "../styles/about.css";
import { playPopSound, playRandom8BitSound } from "./eightBitSynth";

const SECTION_FOR_PATH = {
  "/": "about-section",
  "/about": "about-section",
  "/skills": "skills-section",
  "/projects": "projects-section",
  "/contact": "contact-section",
};

// hidden for now: sea match (/matchgame), work in progress (/wip),
// toolbox (/toolbox), rpg tabletop, infinite terrain
const SITE_TREE = {
  type: types.section,
  title: "connor hopkins",
  children: [
    {
      type: types.section,
      title: "about",
      id: "about-section",
      children: [
        {
          type: types.section,
          title: "personal info",
          children: [
            { type: types.stringContent, title: "job", content: "senior software engineer" },
            { type: types.stringContent, title: "location", content: "tacoma/seattle" },
            { type: types.stringContent, title: "current company", content: "yoodli.ai", href: "https://yoodli.ai" },
          ],
        },
        {
          type: types.section,
          title: "personality fragments",
          children: [
            {
              type: types.section, title: "fragment 1", children: [
                { type: types.stringContent, title: "quote", content: "you should sit in meditation for ten minutes every day - except when you are too busy. then you should sit for an hour." },
                { type: types.stringContent, title: "author", content: "shunryu suzuki" },
              ]
            },
            {
              type: types.section, title: "fragment 2", children: [
                { type: types.stringContent, title: "quote", content: '"meow" means "woof" in cat.' },
                { type: types.stringContent, title: "author", content: "george carlin" },
              ]
            },
          ],
        }
      ],
    },
    {
      type: types.section,
      title: "skills",
      id: "skills-section",
      children: [
        {
          type: types.section,
          title: "technical",
          children: [
            { type: types.stringContent, content: "system architecture" },
            { type: types.stringContent, content: "cloud computing" },
            { type: types.stringContent, content: "ai software development" },
            { type: types.stringContent, content: "typescript" },
            { type: types.stringContent, content: "rest apis" },
            { type: types.stringContent, content: "project management" },
          ],
        },
        {
          type: types.section,
          title: "strengths",
          children: [
            { type: types.audioContent, content: "curiosity", audio: curiosityAudio },
            { type: types.audioContent, content: "strategic thinking", audio: strategicThinkingAudio },
            { type: types.audioContent, content: "'jump in'", audio: jumpInAudio },
            { type: types.audioContent, content: "empathy", audio: empathyAudio },
          ],
        },
        {
          type: types.section,
          title: "weaknesses",
          children: [
            { type: types.audioContent, content: "perfectionistic streak", audio: perfectionisticStreakAudio },
            { type: types.audioContent, content: "impatience with beaurocracy", audio: impatienceAudio },
            { type: types.audioContent, content: "milk products", audio: milkProductsAudio },
          ],
        },
      ],
    },
    {
      type: types.section,
      title: "projects",
      id: "projects-section",
      children: [
        {
          type: types.section,
          title: "art",
          children: [
            { type: types.hrefContent, title: "mapinator", desc: "procedural terrain map generator", href: "https://synnefon.github.io/mapinator" },
            { type: types.linkContent, title: "lava lamp radio", desc: "lava lamp + radio", to: "/lava-lamp-radio" },
            { type: types.linkContent, title: "dendrites", desc: "dendritic growth simulation", to: "/dendrites" },
            { type: types.linkContent, title: "the migration", desc: "monarch sightings sonified", to: "/monarch-music" },
          ],
        },
        {
          type: types.section,
          title: "games",
          children: [
            { type: types.linkContent, title: "snek", desc: "snek!", to: "/snek" },
            { type: types.linkContent, title: "war of the dice", desc: "dice-rolling territory conquest", to: "/war-of-the-dice" },
            { type: types.linkContent, title: "sudoku", desc: "eternal classic", to: "/sudoku" },
            { type: types.linkContent, title: "game of life", desc: "cellular automata simulator", to: "/game-of-life" },
          ],
        },
        {
          type: types.section,
          title: "tools",
          children: [
            { type: types.linkContent, title: "shavian transliterator", desc: "english \u2192 shavian", to: "/shavianator" },
            { type: types.linkContent, title: "shufflenator", desc: "optimal shuffle pattern calculator", to: "/shufflenator" },
          ],
        },
        {
          type: types.section,
          title: "open source",
          children: [
            { type: types.hrefContent, title: "3d models", desc: "collection of my 3d-printable work", href: "https://thangs.com/designer/synnefon" },
            { type: types.hrefContent, title: "img-butler", desc: "image interaction npm package", href: "https://www.npmjs.com/package/img-butler" },
            { type: types.hrefContent, title: "spagett ql", desc: "lisp-like query language. al dente.", href: "https://github.com/synnefon/spagett" },
          ],
        },
      ],
    },
    {
      type: types.section,
      title: "contact",
      id: "contact-section",
      children: [
        { type: types.hrefContent, title: "github", href: "https://github.com/synnefon" },
        { type: types.hrefContent, title: "linkedin", href: "https://www.linkedin.com/in/connor-j-hopkins" },
      ],
    },
  ],
};

const THEMES = ["black", "white", "amber", "blueprint"];

// px; must match .duck-container size in home.css
const DUCK_SIZE = 72;

// Sound and animation timing constants (single source of truth)
const SOUND_DURATION_MS = 1300;
const MAX_VOLUME_MULTIPLIER = 3;
const NUM_ARPEGGIO_STEPS = 5;
const VOLUME_INCREMENT = (MAX_VOLUME_MULTIPLIER - 1) / (NUM_ARPEGGIO_STEPS - 1);

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duckVisible, setDuckVisible] = useState(true);
  const [duckHover, setDuckHover] = useState(false);
  const [flapFrame, setFlapFrame] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("homeTheme");
    return THEMES.includes(saved) ? saved : "white";
  });
  const [skipAnimations, setSkipAnimations] = useState(false);
  const [duckPosition, setDuckPosition] = useState({ left: null, top: null, bottom: null });
  const [docked, setDocked] = useState(true);
  const [dockPos, setDockPos] = useState(null);
  const [noTransition, setNoTransition] = useState(false);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const soundStopRef = useRef(null);
  const soundParamsRef = useRef(null);
  const contentWrapperRef = useRef(null);
  const timeoutRef = useRef(null);
  const duckRef = useRef(null);

  const isMobile = windowWidth <= 768;

  const location = useLocation();
  const navigationType = useNavigationType();
  const firstScrollRef = useRef(true);

  // Scroll to the section matching the current route. The first scroll
  // waits for the webfont so the layout doesn't shift under the target.
  // Replace navigations are the url keeping up with scrolling — skip.
  useEffect(() => {
    const id = SECTION_FOR_PATH[location.pathname];
    if (!id) return;
    if (navigationType === "REPLACE") return;
    const first = firstScrollRef.current;
    firstScrollRef.current = false;
    if (first && location.pathname === "/") return;

    const scroll = () => {
      const behavior = first ? "auto" : "smooth";
      if (id === "about-section") {
        // The first section: go all the way to the top of the page
        document.getElementById("app-base")?.scrollTo({ top: 0, behavior });
      } else {
        document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
      }
    };

    if (first) {
      document.fonts.ready.then(scroll);
    } else {
      scroll();
    }
  }, [location.pathname, navigationType]);

  useEffect(() => {
    // Check if animation has been seen before (localStorage persists across visits)
    const hasSeenAnimation = localStorage.getItem("hasSeenHomeAnimation") === "true";

    if (hasSeenAnimation) {
      // Skip flutter, show text immediately
      setSkipAnimations(true);
    }
  }, []);

  // While docked, the duck is pinned just under the last menu item.
  // Track the navbar through resizes, hamburger toggles, and font loads.
  useEffect(() => {
    if (!docked) return;
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;

    const measure = () => {
      const navRect = navbar.getBoundingClientRect();
      const links = navbar.querySelectorAll(".nav-link");
      const anchor = links.length
        ? links[links.length - 1].getBoundingClientRect()
        : navRect;
      setDockPos({ left: navRect.left, top: anchor.bottom, width: navRect.width });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navbar);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [docked]);

  // Flap the duck's arms while it sings
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => setFlapFrame((f) => !f), 150);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Update window width on resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Once the animation was seen, remember it
  useEffect(() => {
    if (skipAnimations) return;
    localStorage.setItem("hasSeenHomeAnimation", "true");
  }, [skipAnimations]);

  // Remember the chosen theme across visits
  useEffect(() => {
    localStorage.setItem("homeTheme", theme);
  }, [theme]);

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

  // Big eyes when hovered or singing; no wings while docked in the
  // menu; flapping alternates the wings while singing on the page.
  const duckFace = () => {
    const eyes = isPlaying || duckHover ? "⚆ɞ⚆" : "•ɞ•";
    if (docked) return `₍${eyes}₎`;
    if (isPlaying) return flapFrame ? `ˏ₍${eyes}₎ˎ` : `ˋ₍${eyes}₎ˊ`;
    return `ˏ₍${eyes}₎ˎ`;
  };

  // Pick a safe spot in the current view, anchored to page coordinates
  // so the duck stays put when the page scrolls.
  const spawnDuckInView = () => {
    const scroller = document.getElementById("app-base");
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const viewportPos =
      duckPosition.top !== null
        ? { ...duckPosition, top: duckPosition.top - scrollTop }
        : duckPosition;
    const next = findSafeViewportSpot({
      size: DUCK_SIZE,
      currentPos: viewportPos,
      minDistance: 150,
    });
    return next.top !== null ? { ...next, top: next.top + scrollTop } : next;
  };

  // First click: the duck leaves the menu and flies onto the page.
  // Swap fixed viewport coords for page coords in place (no visible
  // move), then fly to a random spot once the swap has painted.
  const flyOntoPage = () => {
    const scroller = document.getElementById("app-base");
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const rect = duckRef.current.getBoundingClientRect();
    setDocked(false);
    setNoTransition(true);
    setDuckPosition({
      left: rect.left,
      // Center the full-size box on the menu-row glyph
      top: rect.top + (rect.height - DUCK_SIZE) / 2 + scrollTop,
      bottom: null,
    });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setNoTransition(false);
        const next = findSafeViewportSpot({
          size: DUCK_SIZE,
          currentPos: { left: rect.left, top: rect.top },
          minDistance: 150,
        });
        setDuckPosition(
          next.top !== null ? { ...next, top: next.top + scrollTop } : next
        );
      })
    );
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
      newVolumeMultiplier = Math.min(
        volumeMultiplier + VOLUME_INCREMENT,
        MAX_VOLUME_MULTIPLIER
      );
      setVolumeMultiplier(newVolumeMultiplier);
      // Reuse the same sound parameters
      soundParams = soundParamsRef.current;
    } else {
      // Reset volume multiplier and sound params on first click
      newVolumeMultiplier = 1;
      setVolumeMultiplier(1);
      soundParamsRef.current = null;
    }

    // Move duck to a random spot in the current view
    if (docked) {
      flyOntoPage();
    } else {
      setDuckPosition(spawnDuckInView());
    }

    // Start playing sound with current volume multiplier, params, and arpeggio step
    // arpeggioStep is 0-indexed: volume 1.0→step 0, 1.5→step 1, 2.0→step 2, 2.5→step 3, 3.0→step 4
    const arpeggioStep = Math.round(
      (newVolumeMultiplier - 1) / VOLUME_INCREMENT
    );
    setIsPlaying(true);
    const sound = playRandom8BitSound(
      newVolumeMultiplier,
      soundParams,
      arpeggioStep
    );
    soundStopRef.current = sound.stop;
    soundParamsRef.current = sound.params;

    // Log the pattern and key on first click of sequence
    if (!shouldReplaySameSound) {
      console.log(`Playing ${sound.params.pattern} in ${sound.params.keyNote}`);
    }

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

  return (
    <div id="app-base" className={`home-colors theme-${theme}`}>
      <div className="theme-picker">
        {THEMES.map((t) => (
          <button
            key={t}
            aria-label={`${t} theme`}
            className={`theme-box theme-box-${t} ${theme === t ? "selected" : ""}`}
            onClick={() => setTheme(t)}
          />
        ))}
      </div>
      <div className="content-wrapper home-colors" ref={contentWrapperRef}>

        <AsciiTree root={SITE_TREE} />

        <Self />
      </div>

      <PaperPlanes />

      {/* Duck */}
      {duckVisible && !isMobile && (!docked || dockPos !== null) && (
        <div
          ref={duckRef}
          className={`duck-container ${docked ? "docked" : ""} ${
            isPlaying ? "wiggle" : ""
          } ${noTransition ? "no-transition" : ""}`}
          style={
            docked
              ? {
                  left: `${dockPos.left}px`,
                  top: `${dockPos.top}px`,
                  width: `${dockPos.width}px`,
                }
              : {
                  left:
                    duckPosition.left !== null
                      ? `${duckPosition.left}px`
                      : "auto",
                  top:
                    duckPosition.top !== null ? `${duckPosition.top}px` : "auto",
                  bottom:
                    duckPosition.bottom !== null
                      ? `${duckPosition.bottom}px`
                      : "auto",
                }
          }
          onClick={handleClick}
          onMouseEnter={() => setDuckHover(true)}
          onMouseLeave={() => setDuckHover(false)}
        >
          <span className="duck-icon" role="img" aria-label="duck">
            {duckFace()}
          </span>
        </div>
      )}
    </div>
  );
}
