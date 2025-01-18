import { useEffect, useState, useMemo, useRef } from "react";
import Self from "./Self";
import { TypeAnimation } from 'react-type-animation';

import '../styles/about.css'

export default function About() {
  const [skip, setSkip] = useState(false);
  const skipButton = useRef(
    <button 
      id='skip-button'
      onClick={() => setSkip(true)}
    >
      skip?
    </button>
  );
  const tldr = "i'm a software engineer with 5+ years of experience designing, building, and maintaining cloud-based web apps at scale.";
  const descriptions = useMemo(() => [
    "i'm obessed with the act of creation, and gain fulfillment from seeing people use my work.",
    "i want to feel that the products i create matter to the world beyond myself.",
    "i operate best when using rapid iteration workflows: dive in and try something, gather the right data, then make it better. repeat.",
    "i love being on teams of trusting, growth-oriented peers following a shared vision.",
    "strengths: curiosity, strategic thinking, 'jump in', and empathy.",
    "weaknesses: perfectionistic streak, dislike of beaurocracy, and milk products.",
  ], []);

  const hideSkipButton = () => {
    document.getElementById('skip-button').style.visibility = 'hidden';
  }

  const TypeIt = ({ idx, desc }) => {
    const [display, setDisplay] = useState(false);
  
    useEffect(() => {
      if (display) return;
      const delayDuration = idx * (skip ? 0 : 6_900);
      const t1 = setTimeout(() => {
        setDisplay(true);
        if (idx === descriptions.length) hideSkipButton();
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
    return (
      <span
        className="me-fact-wrapper"
        key={desc}
        onMouseEnter={(e) => e.currentTarget.classList.add('wiggle')}
        onAnimationEnd={(e) => e.currentTarget.classList.remove('wiggle')}
      >
        <TypeIt idx={idx} desc={desc} />
      </span>
    );
  };

  return (
    <div id='app-base' className="about-colors">
      <>
        <div className="about-text-wrapper">
          <div className="about-text">
            <h1 className="about-title"><span>hello 🖖 </span><span>i'm connor</span></h1>
            <div id="about-description" className="about-description">
              <b><MeFact idx={0} desc={tldr} /></b>
              <br />
              <br />
              {descriptions.map((desc, idx) => <MeFact key={desc} idx={idx + 1} desc={desc} />)}
              {skipButton.current}
            </div>
          </div>
        </div>
        <Self />
      </>
    </div>
  );
};
