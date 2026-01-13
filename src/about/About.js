import { useEffect, useRef, useState } from "react";
import { TypeAnimation } from "react-type-animation";
import { PersonalAudio } from "../util/Audio";
import Self from "./Self";
import headphonesIcon from "../assets/about/headphones.svg";
import SocialIcons from "../components/SocialIcons";

import "../styles/about.css";

const Description = (initialShowSelf, text) => {
  const [showSelf, setShowSelf] = useState(initialShowSelf);
  return { showSelf, setShowSelf, text };
};

export default function About() {
  const [skip, setSkip] = useState(false);

  const sfx = useRef(new PersonalAudio());
  const descriptions = [
    Description(
      true,
      (() => {
        // Calculate dynamic years experience since Sept 1, 2019
        const start = new Date(2019, 8, 1); // month is zero-based: 8 = September
        const now = new Date();
        let years = now.getFullYear() - start.getFullYear();
        // If current date before Sept 1 in the current year, subtract 1
        if (now.getMonth() < 8 || (now.getMonth() === 8 && now.getDate() < 1)) {
          years -= 1;
        }
        // Always show at least 1 year, just in case
        const yearsString = `${years}+ years`;
        return `i'm a software engineer with ${yearsString} of experience designing, building, and scaling cloud-based systems.`;
      })()
    ),
    Description(
      false,
      "i'm obessed with the act of creation, and gain fulfillment from seeing people use my work."
    ),
    Description(
      false,
      "i want to feel that the products i create matter to the world beyond myself."
    ),
    Description(
      false,
      "i operate best when using rapid iteration workflows: dive in and try something, gather the right data, then make it better. repeat."
    ),
    Description(
      false,
      "i love being on teams of trusting, growth-oriented peers following a shared vision."
    ),
    Description(
      false,
      "strengths: curiosity, strategic thinking, 'jump in', and empathy."
    ),
    Description(
      false,
      "weaknesses: perfectionistic streak, impatience with beaurocracy, and milk products."
    ),
  ];
  const skipButton = useRef(
    <button
      id="skip-button"
      onClick={() => {
        descriptions.forEach((d) => d.setShowSelf(true));
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

  const TypeIt = ({ idx, desc, audioSrc }) => {
    const onFinishedTyping = () => {
      setTimeout(() => {
        if (sfx.current.isPlaying()) {
          return setTimeout(
            onFinishedTyping,
            sfx.current.timeLeft() * 1_000
          );
        }
        descriptions.at(idx + 1)?.setShowSelf(true);
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

    return descriptions.at(idx + 1)?.showSelf || skip ? (
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
    useEffect(() => () => sfx.current.pause(), []);

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

    const toggleSfx = () => {
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
