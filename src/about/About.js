import { useEffect, useState, useMemo, useCallback } from "react";
import Self from "./Self";
import { TypeAnimation } from 'react-type-animation';


import '../styles/about.css'

function TypeIt({text}) {
  return <TypeAnimation
    className='description-text home-colors'
    sequence={[text, 1_000]}
    wrapper="p"
    deletionSpeed={60}
    repeat={1}
    cursor={false}
  />
}

export default function About() {
  const [descriptions, setDescriptions] = useState([])
  const [descIdx, setDescIdx] = useState(0);
  const descriptionList = useMemo(() => [
    "i'm obessed with the act of creation, and gain fulfillment from seeing people use my work.",
    "test a"
  ], [])

  const addNextDesc = useCallback(() => {
    if (descIdx >= descriptionList.length) return;
    const desc = <TypeIt key={descriptionList[descIdx]} text={descriptionList[descIdx]}/>
    setDescIdx((descIdx) => descIdx + 1);
    setDescriptions((d) => d.concat(desc));
  }, [descIdx, descriptionList])

  useEffect(() => {
    const t1 = setTimeout(() => addNextDesc, 1_000);
    return () => clearTimeout(t1);
  }, [addNextDesc, descIdx]);

  useEffect(() => {
    console.log("here")
    addNextDesc()
  }, [addNextDesc])

  return (
    <div id='app-base' className="about-colors">
      <div className="about-text">
        {/* <h1 className="about-title about-colors">hello 🖖 i'm connor</h1> */}
        <div id="about-description" className="about-description">
          {/* <p>i'm a software engineer with 5+ years of experience designing, building, and maintaining cloud-based web apps at scale.</p> */}
          <br/>
          {/* {descriptions} */}
          <p>PAGE UNDER CONSTRUCTION</p>
          
          {/* <TypeIt text={"i want to feel that the products i create matter to the world beyond myself."}/>
          <TypeIt text={"i operate best when using rapid iteration workflows: dive in and try something, gather the right data, then make it better. repeat."}/>
          <TypeIt text={"i want to work on a team of trusting peers with a shared vision, yet a wide variety of perspectives and expertise."}/> */}
        </div>
      </div>
      <Self/>
    </div>
  );
}