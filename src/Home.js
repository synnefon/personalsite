import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import personIcon from './assets/person.png';
import selfGif from './assets/self.gif';

import './app.css';

export default function Home() {
  const [showSelf, setShowSelf] = useState(false);
  const toggleShowSelf = () => setShowSelf(!showSelf);

  useEffect(() => {
    if (!showSelf) return;
    
    const timeoutId = setTimeout(() => setShowSelf(false), 12_000);
    return () => clearTimeout(timeoutId);
    
  }, [showSelf]);

  return (
    <div className="app-base">
      <div className="content-wrapper">
        <h2 className="title">Connor Hopkins</h2>
        <h6 className="description">Software Engineer, Thing-Maker, Dungeon Master, Fictional Character.</h6>
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
        {showSelf && <img id="self-gif" alt="a gif of the author waving" src={selfGif}/> }
      </div>
    </div>
  );
}