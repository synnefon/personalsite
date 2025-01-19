import { useEffect, useState, useMemo, useRef } from "react";
import Self from "./Self";
import { TypeAnimation } from 'react-type-animation';

import '../styles/about.css'

export default function About() {
  const [skip, setSkip] = useState(false);
  
  const sfx = useRef(new Audio());
  const tldr = "i'm a software engineer with 5+ years of experience designing, building, and scaling cloud-based systems.";
  const descriptions = useMemo(() => [
    "i'm obessed with the act of creation, and gain fulfillment from seeing people use my work.",
    "i want to feel that the products i create matter to the world beyond myself.",
    "i operate best when using rapid iteration workflows: dive in and try something, gather the right data, then make it better. repeat.",
    "i love being on teams of trusting, growth-oriented peers following a shared vision.",
    "strengths: curiosity, strategic thinking, 'jump in', and empathy.",
    "weaknesses: perfectionistic streak, dislike of beaurocracy, and milk products.",
  ], []);
  const skipButton = useRef(<button id='skip-button' onClick={() => setSkip(true)}/>);

  const isPlaying = function (audioSrc) {
    return sfx.current
        && sfx.current.src?.includes(audioSrc)
        && sfx.current.currentTime > 0
        && !sfx.current.paused
        && !sfx.current.ended
        && sfx.current.readyState > 2;
  }

  const toggleSkipButton = (show) => {
    setTimeout(() => {
      document.getElementById('skip-button').style.opacity = show ? '1' : '0';
      document.getElementById('skip-button').style.visibility = show ? 'visible' : 'hidden';
    }, 1_000);
  }

  const TypeIt = ({ idx, desc }) => {
    const [display, setDisplay] = useState(false);
  
    useEffect(() => {
      if (display) return;
      const delayDuration = idx * (skip ? 0 : 6_900);
      const t1 = setTimeout(() => {
        setDisplay(true);
        if (idx === 0) toggleSkipButton(true);
        else if (idx === descriptions.length-1) toggleSkipButton(false);
      }, delayDuration);
      return () => clearTimeout(t1);
    }, [display, idx]);

    const Fact = ({desc}) => {
      return (
        skip ? <p className="me-fact" key={desc}>{desc}</p>
        : <TypeAnimation
            className="me-fact"
            key={desc}
            sequence={[desc, 55]}
            wrapper="p"
            speed={55}
            repeat={1}
            cursor={false}
          />
      );
    }
  
    return <> {display ? <Fact desc={desc}/> : <></>} </>;
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
      const playing = isPlaying(audioSrc);

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
            <MeFact idx={0} desc={tldr} />
            <br/>
            {descriptions.map((desc, idx) => <MeFact key={desc} idx={idx + 1} desc={desc} />)}
            {skipButton.current}
          </div>
        </div>
      </div>
      <Self />
    </div>
  );
};
