import { useEffect, useState, useMemo, useCallback } from "react";
import Self from "./Self";
import { TypeAnimation } from 'react-type-animation';

import '../styles/about.css'


export default function About() {
  const descriptionList = useMemo(() => [
    "weaknesses: perfectionistic streak, dislike of beaurocracy, and milk products.",
    "strengths: curiosity, strategic thinking, 'jump in', and empathy.",
    "i love being part of teams of trusting, growth-oriented peers following a shared vision.",
    "i operate best when using rapid iteration workflows: dive in and try something, gather the right data, then make it better. repeat.",
    "i want to feel that the products i create matter to the world beyond myself.",
    "i'm obessed with the act of creation, and gain fulfillment from seeing people use my work.",
    ""
  ], []);
  const [descriptions, setDescriptions] = useState([]);

  const addDesc = useCallback(() => {
    const desc = descriptionList.pop();
    console.log(desc)
    if (!desc) return;
    setDescriptions((descriptions) => [...descriptions, desc]);
    setTimeout(addDesc, 8_500);
  }, [descriptionList]);

  useEffect(() => {
    console.log("here")
    console.log(descriptionList)
    console.log(descriptions)
    setTimeout(addDesc, 3_000);
  }, [addDesc]);

  return (
    <div id='app-base' className="about-colors">
      <div className="about-text-wrapper">
        <div className="about-text">
          <h1 className="about-title"><span>hello 🖖 </span><span>i'm connor</span></h1>
          <div id="about-description" className="about-description">
            <span
                className="me-fact-wrapper"
                onMouseEnter={(e) => e.currentTarget.classList.add('flip')} 
                onAnimationEnd={(e) => e.currentTarget.classList.remove('flip')}
              >
              <b className="me-fact">i'm a software engineer with 5+ years of experience designing, building, and maintaining cloud-based web apps at scale.</b>
            </span>
            <br />
            <br />
            {descriptions.map(d =>
              <span
                className="me-fact-wrapper"
                onMouseEnter={(e) => e.currentTarget.classList.add('flip')} 
                onAnimationEnd={(e) => e.currentTarget.classList.remove('flip')}
              >
                <TypeAnimation
                  className="me-fact"
                  key={d}
                  sequence={[d, 2_000]}
                  wrapper="p"
                  speed={55}
                  repeat={1}
                  cursor={false}
                />
              </span>
            )}
          </div>
        </div>
      </div>
      <Self />
    </div>
  );
}