import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Raincloud from './Raincloud';
import Self from './Self';

import '../styles/home.css';

export default function Home() {
  const [showSelf, setShowSelf] = useState(false);
  const [descriptionIdx, setDescriptionIdx] = useState(1);
  const [description, setDescription] = useState('software engineer');

  const toggleShowSelf = () => {
    restartGif();
    setShowSelf(!showSelf);
  }

  const restartGif = () => { 
    const gif = document.getElementById("self-gif");
    gif.style = "display: none;";
    gif.style = "display: block;";
    if (gif) {
      setTimeout(() => {
        var imgSrc = gif.src;
        gif.src = imgSrc; 
      }, 0);
    }
  }

  useEffect(() => {
    if (!showSelf) return;
    const timeoutId = setTimeout(() => setShowSelf(false), 12_000);

    return () => clearTimeout(timeoutId);
  }, [showSelf]);

  
  useEffect(() => {
    const descriptors = [
      'software engineer', 'thing maker', 'dungeon master', 'rock climber', 'cat dad', 'aspiring wood worker', 'crepuscular code creator', '3d printer mechanic',
       'bike lane survivor', 'magic player', 'part-time audiophile', 'full-time wikipedia spelunker', 'human band name generator', 'fast reader, slow typer', 'secretly a gnome',
      'lava lamp enthusiast', 'map fanatic', 'habitual oatmeal eater', 'lower case advocate', 'the ignoble', 'bug fact purveyor', 'list writer', 'rumored fictional character',
      'have i mentioned software engineer already?',
      '...pls look at projects', '...or just click on any link', "is running out of autobiographical subheadings",
    ];
    
    const timeoutId = setTimeout(() => {
      setDescription(descriptors[descriptionIdx]);
      setDescriptionIdx((descriptionIdx+1) % descriptors.length);
    }, 2_700);

    return () => clearTimeout(timeoutId);
  }, [description, descriptionIdx])

  return (
    <div id="app-base">
      <div className="content-wrapper">
        <h2 className="title">connor hopkins</h2>
        <h6 className="description">{`{ ${description} }`}</h6>
        <div className="links">
          <Link className="link-home" to="/wip" rel="noreferrer">
            <p className="link-text">resume</p>
          </Link>
          <Link className="link-home" to="/projects" rel="noreferrer">
            <p className="link-text">projects</p>
          </Link>
          <a className="link-home" href="https://github.com/synnefon" rel="noreferrer">
            <p className="link-text">github</p>
          </a>
          <a className="link-home" href="https://www.linkedin.com/in/connor-j-hopkins" rel="noreferrer">
            <p className="link-text">linkedin</p>
          </a>
        </div>
        <Raincloud numDrops={20}/>
        <Self showSelf={showSelf} toggleShowSelf={toggleShowSelf}/>
      </div>
    </div>
  );
}