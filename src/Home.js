import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import personIcon from './assets/person.png';
import selfGif from './assets/self.gif';

import './app.css';

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
    const descriptors = ['software engineer', 'thing-maker', 'dungeon master', 'rock climber', 'cat dad', 'aspiring wood worker',  'part-time audiophile', 'full-time wikipedia spelunker',
       'human band name generator', 'fast reader, slow typer','fictional character', 'lava lamp enthusiast', 'user of the lower case', 'the ignoble', 'enjoyer of snacks', 
       '...pls look at projects', '...or just click on any link', 'im running out of autobaiographical subheadings', 'collector of stickers'];
    
    const timeoutId = setTimeout(() => {
      setDescription(descriptors[descriptionIdx]);
      setDescriptionIdx((descriptionIdx+1) % descriptors.length);
    }, 2_700);

    return () => clearTimeout(timeoutId);
  }, [description, descriptionIdx])

  return (
    <div className="app-base">
      <div className="content-wrapper">
        <h2 className="title">connor hopkins</h2>
        <h6 className="description">{`{ ${description} }`}</h6>
        <div className="links">
          <a className="link-home" href="https://github.com/synnefon" rel="noreferrer">
            <p className="link-text">github</p>
          </a>
          <a className="link-home" href="https://www.linkedin.com/in/connor-j-hopkins" rel="noreferrer">
            <p className="link-text">linkedin</p>
          </a>
          <Link className="link-home" to="/projects" rel="noreferrer">
            <p className="link-text">projects</p>
          </Link>
        </div>
        <img 
          id="person-icon"
          className={`${showSelf ? 'invisible' : ''}`}
          alt="a pixelated person"
          src={personIcon}
          onClick={toggleShowSelf}
        />
        <img 
          id="self-gif"
          alt="a gif of the author waving"
          src={selfGif} style={{display: showSelf ? 'block' : 'none'}}
        />
      </div>
    </div>
  );
}