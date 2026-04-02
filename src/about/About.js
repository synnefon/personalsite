import { useEffect, useRef, useState } from "react";
import { TypeAnimation } from "react-type-animation";
import { PersonalAudio } from "../util/Audio";
import Self from "./Self";
import headphonesIcon from "../assets/about/headphones.svg";
import voice0Pre from "../assets/about/voices/0_pre.m4a";
import voice0Post from "../assets/about/voices/0_post.m4a";
import SocialIcons from "../components/SocialIcons";

import "../styles/about.css";

const Description = (initialShowSelf, text) => {
  const [showSelf, setShowSelf] = useState(initialShowSelf);
  return { showSelf, setShowSelf, text };
};

const NUM_DESCRIPTIONS = 7;

export default function About() {
  const [seenIndex] = useState(() => Number(sessionStorage.getItem("aboutSeenIndex") ?? -1));
  const [skip, setSkip] = useState(() => seenIndex >= NUM_DESCRIPTIONS - 1);

  const sfx = useRef(new PersonalAudio());
  const ttsVoice = useRef(null);

  useEffect(() => {
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const prefs = ["Daniel", "Samantha", "Karen", "Google UK English Male", "Google US English"];
      ttsVoice.current = prefs.reduce((found, name) =>
        found || voices.find((v) => v.name.includes(name)), null) || voices.find((v) => v.lang.startsWith("en")) || null;
    };
    pickVoice();
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pickVoice);
  }, []);

  // Calculate dynamic years experience since Sept 1, 2019
  const start = new Date(2019, 8, 1); // month is zero-based: 8 = September
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  if (now.getMonth() < 8 || (now.getMonth() === 8 && now.getDate() < 1)) {
    years -= 1;
  }
  const yearsString = `${years}+`;

  const descriptionTexts = [
    `i'm a software engineer with ${yearsString} years of experience designing, building, and scaling cloud-based systems.`,
    "i'm obessed with the act of creation, and gain fulfillment from seeing people use my work.",
    "i want to feel that the products i create matter to the world beyond myself.",
    "i operate best when using rapid iteration workflows: dive in and try something, gather the right data, then make it better. repeat.",
    "i love being on teams of trusting, growth-oriented peers following a shared vision.",
    "strengths: curiosity, strategic thinking, 'jump in', and empathy.",
    "weaknesses: perfectionistic streak, impatience with beaurocracy, and milk products.",
  ];
  const descriptions = descriptionTexts.map((text, i) =>
    Description(i === 0 || i <= seenIndex + 1, text)
  );

  // First description is always visible, mark it seen
  if (seenIndex < 0) sessionStorage.setItem("aboutSeenIndex", "0");

  // Show skip button if partially through descriptions
  const shouldShowSkip = seenIndex >= 0 && seenIndex < NUM_DESCRIPTIONS - 1;

  const skipButton = useRef(
    <button
      id="skip-button"
      onClick={() => {
        descriptions.forEach((d) => d.setShowSelf(true));
        sessionStorage.setItem("aboutSeenIndex", descriptions.length - 1);
        setSkip(true);
        toggleSkipButton(false);
      }}
    />
  );

  const toggleSkipButton = (shouldShow) => {
    const skipButton = document.getElementById("skip-button");
    if (!skipButton) return;
    skipButton.style.opacity = shouldShow ? "1" : "0";
    skipButton.style.visibility = shouldShow ? "visible" : "hidden";
  };

  useEffect(() => {
    if (shouldShowSkip) toggleSkipButton(true);
  }, [shouldShowSkip]);

  const TypeIt = ({ idx, desc, audioSrc }) => {
    const onFinishedTyping = () => {
      setTimeout(() => {
        if (sfx.current.isPlaying()) {
          return setTimeout(
            onFinishedTyping,
            sfx.current.timeLeft() * 1_000
          );
        }
        if (descriptions.at(idx + 1)) {
          descriptions[idx + 1].setShowSelf(true);
          sessionStorage.setItem("aboutSeenIndex", idx + 1);
        }
        if (idx === 0) toggleSkipButton(true);
        if (idx === descriptions.length - 2) toggleSkipButton(false);
      }, 2_000);
    };

    const fixed = (
      <p className="me-fact" key={desc}>
        {desc}
      </p>
    );
    const anim = (
      <TypeAnimation
        className="me-fact"
        key={desc}
        sequence={[desc, onFinishedTyping, 55]}
        wrapper="p"
        speed={65}
        repeat={1}
        cursor={false}
      />
    );

    return idx <= seenIndex || descriptions.at(idx + 1)?.showSelf || skip ? (
      fixed
    ) : descriptions[idx].showSelf ? (
      anim
    ) : (
      <></>
    );
  };

  const MeFact = ({ idx, desc }) => {
    const audioSrc = require(`../assets/about/voices/${idx}.m4a`);
    // pause audio when page changes
    useEffect(() => () => {
      sfx.current.pause();
      window.speechSynthesis.cancel();
    }, []);

    const applyPlayingEffects = () => {
      resetPlayingEffects();
      document.getElementById(`me-fact-wrapper${idx}`).style.color = "orange";
      document.getElementById(`me-fact-wrapper${idx}`).style.fontWeight =
        "bold";
    };

    const resetPlayingEffects = () => {
      Array.from(document.getElementsByClassName("me-fact-wrapper"))?.forEach(
        (element) => {
          element.style.fontWeight = "normal";
          element.style.color = "inherit";
        }
      );
    };

    const playFirstFact = () => {
      if (sfx.current.isPlaying() || window.speechSynthesis.speaking) {
        sfx.current.pause();
        window.speechSynthesis.cancel();
        resetPlayingEffects();
        return;
      }
      applyPlayingEffects();
      sfx.current.src = voice0Pre;
      sfx.current.play();
      sfx.current.onended = () => {
        const utterance = new SpeechSynthesisUtterance(yearsString);
        if (ttsVoice.current) utterance.voice = ttsVoice.current;
        utterance.onend = () => {
          sfx.current.src = voice0Post;
          sfx.current.play();
          sfx.current.onended = () => resetPlayingEffects();
          sfx.current.onpause = () => resetPlayingEffects();
        };
        window.speechSynthesis.speak(utterance);
      };
      sfx.current.onpause = () => {
        window.speechSynthesis.cancel();
        resetPlayingEffects();
      };
    };

    const toggleSfx = () => {
      if (idx === 0) return playFirstFact();
      if (sfx.current.isPlayingSrc(audioSrc)) {
        return sfx.current.pause();
      }
      applyPlayingEffects();
      sfx.current.src = audioSrc;
      sfx.current.play();
      sfx.current.onended = () => resetPlayingEffects();
      sfx.current.onpause = () => resetPlayingEffects();
    };

    return (
      <span className="me-fact-wrapper" id={`me-fact-wrapper${idx}`} key={desc}>
        <img
          src={headphonesIcon}
          alt="headphones"
          className="headphones-icon"
          draggable={false}
        />
        <div className="" onClick={toggleSfx}>
          <TypeIt idx={idx} desc={desc} audioSrc={audioSrc} />
        </div>
      </span>
    );
  };

  return (
    <div id="app-base" className="about-colors">
      <SocialIcons />
      <div className="about-text-wrapper">
        <div className="about-text">
          <h1 className="about-title">
            <span>hello, i'm connor</span>
          </h1>
          <div id="about-description" className="about-description">
            {descriptions.map((desc, idx) => {
              return <MeFact key={desc.text} idx={idx} desc={desc.text} />;
            })}
            {skipButton.current}
          </div>
        </div>
      </div>
      <Self listExpanded={skip || descriptions.every((d) => d.showSelf)} />
    </div>
  );
}
