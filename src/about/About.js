import { useEffect, useState, useRef } from "react";
import { TypeAnimation } from 'react-type-animation';
import { PersonalAudio } from "../util/Audio";
import Self from "./Self";

import '../styles/about.css';

const Description = (initialShowSelf, text) => {
  const [showSelf, setShowSelf] = useState(initialShowSelf);
  return { showSelf, setShowSelf, text };
}

export default function About() {
  const [skip, setSkip] = useState(false);
  
  const sfx = useRef(new PersonalAudio());
  const descriptions = [
    Description(true, "i'm a software engineer with 5+ years of experience designing, building, and scaling cloud-based systems."),
    Description(false, "i'm obessed with the act of creation, and gain fulfillment from seeing people use my work."),
    Description(false, "i want to feel that the products i create matter to the world beyond myself."),
    Description(false, "i operate best when using rapid iteration workflows: dive in and try something, gather the right data, then make it better. repeat."),
    Description(false, "i love being on teams of trusting, growth-oriented peers following a shared vision."),
    Description(false, "strengths: curiosity, strategic thinking, 'jump in', and empathy."),
    Description(false, "weaknesses: perfectionistic streak, dislike of beaurocracy, and milk products."),
  ];
  const skipButton = useRef(<button id='skip-button' onClick={() => {
    descriptions.forEach((d) => d.setShowSelf(true));
    setSkip(true);
    toggleSkipButton(false);
  }}/>);

  const toggleSkipButton = (shouldShow) => {
    setTimeout(() => {
      const skipButton = document.getElementById('skip-button');
      if (!skipButton) return;
      skipButton.style.opacity = shouldShow ? '1' : '0';
      skipButton.style.visibility = shouldShow ? 'visible' : 'hidden';
    }, 500);
  };

  const TypeIt = ({ idx, desc, audioSrc }) => {
    const onFinishedTyping = () => {
      setTimeout(() => {
        if (sfx.current.isPlayingSrc(audioSrc)) {
          return setTimeout(onFinishedTyping, (sfx.current.timeLeft() * 1_000) - 2_000);
        }
        descriptions.at(idx+1)?.setShowSelf(true);
        if (idx === 0) toggleSkipButton(true);
        if (idx === descriptions.length - 2) toggleSkipButton(false);
      }, 2_000);
    }

    const anim = <TypeAnimation
      className="me-fact"
      key={desc}
      sequence={[desc, onFinishedTyping, 55]}
      wrapper="p"
      speed={65}
      repeat={1}
      cursor={false}
    />;
  
    return (
      descriptions.at(idx+1)?.showSelf || skip 
        ? <p className="me-fact" key={desc}>{desc}</p>
        : descriptions[idx].showSelf ? anim : <></>
    );
  };
  
  const MeFact = ({ idx, desc }) => {
    const audioSrc = require(`../assets/about_voices/${idx}.m4a`);
    // pause audio when page changes
    useEffect(() => () => sfx.current.pause(), []);

    const applyPlayingEffects = () => {
      resetPlayingEffects();
      document.getElementById(`me-fact-wrapper${idx}`).style.color = 'orange';
      document.getElementById(`me-fact-wrapper${idx}`).style.fontWeight = 'bold';
    };

    const resetPlayingEffects = () => {
      Array.from(document.getElementsByClassName("me-fact-wrapper"))?.forEach(element => {
        element.style.fontWeight = 'normal';
        element.style.color = 'inherit';
      });
    }

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
      <span 
        className="me-fact-wrapper"
        id={`me-fact-wrapper${idx}`}
        key={desc}
        onClick={toggleSfx}
      >
        <TypeIt idx={idx} desc={desc} audioSrc={audioSrc} />
      </span>
    );
  };

  return (
    <div id='app-base' className="about-colors">
      <div className="about-text-wrapper">
        <div className="about-text">
          <h1 className="about-title"><span>hello 🖖 </span><span>i'm connor</span></h1>
          <div id="about-description" className="about-description">
            {descriptions.map((desc, idx) => <MeFact key={desc.text} idx={idx} desc={desc.text} />)}
            {skipButton.current}
          </div>
        </div>
      </div>
      <Self />
    </div>
  );
};
