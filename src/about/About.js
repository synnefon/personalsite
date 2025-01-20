import { useEffect, useState, useRef } from "react";
import { TypeAnimation } from 'react-type-animation';
import { PersonalAudio } from "../util/Audio";
import Self from "./Self";

import '../styles/about.css';


export default function About() {
  const [skip, setSkip] = useState(false);
  
  const sfx = useRef(new PersonalAudio());
  const MakeDescription = (initialShowSelf, text) => {
    const [showSelf, setShowSelf] = useState(initialShowSelf);
    return { showSelf, setShowSelf, text };
  }
  const descriptions = [
    MakeDescription(true, "i'm a software engineer with 5+ years of experience designing, building, and scaling cloud-based systems."),
    MakeDescription(false, "i'm obessed with the act of creation, and gain fulfillment from seeing people use my work."),
    MakeDescription(false, "i want to feel that the products i create matter to the world beyond myself."),
    MakeDescription(false, "i operate best when using rapid iteration workflows: dive in and try something, gather the right data, then make it better. repeat."),
    MakeDescription(false, "i love being on teams of trusting, growth-oriented peers following a shared vision."),
    MakeDescription(false, "strengths: curiosity, strategic thinking, 'jump in', and empathy."),
    MakeDescription(false, "weaknesses: perfectionistic streak, dislike of beaurocracy, and milk products."),
  ];
  const skipButton = useRef(<button id='skip-button' onClick={() => {
    descriptions.forEach((d) => d.setShowSelf(true));
    setSkip(true);
    toggleSkipButton(false);
  }}/>);

  const toggleSkipButton = (shouldShow) => {
    setTimeout(() => {
      document.getElementById('skip-button').style.opacity = shouldShow ? '1' : '0';
      document.getElementById('skip-button').style.visibility = shouldShow ? 'visible' : 'hidden';
    }, 500);
  };

  const TypeIt = ({ idx, desc }) => {
    const onFinishedTyping = () => {
      setTimeout(() => {
        const audioSrc = require(`../assets/about_voices/${idx}.m4a`);
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
      speed={55}
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
      const audioSrc = require(`../assets/about_voices/${idx}.m4a`);
      const playing = sfx.current.isPlayingSrc(audioSrc);
      if (playing) return sfx.current.pause();
      
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
        <TypeIt idx={idx} desc={desc} />
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
