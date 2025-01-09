import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Raincloud from '../raincloud/Raincloud';
import Self from './Self';

import '../styles/home.css';
import { getRandomColor } from '../util/Color';

export default function Home() {
  const [descriptionIdx, setDescriptionIdx] = useState(1);
  const [description, setDescription] = useState('software engineer');
  const [showLightning, setShowLightning] = useState(false);
  const [descriptionCycling, setDescriptionCycling] = useState(false);

  const descriptors = [
    'software engineer', 'thing maker', 'dungeon master', 'rock climber', 'cat dad', 'aspiring wood worker', 'crepuscular code creator', '3d printer mechanic',
     'bike lane survivor', 'magic player', 'part-time audiophile', 'full-time wikipedia spelunker', 'human band name generator', 'fast reader, slow typer', 'secretly a gnome',
    'lava lamp enthusiast', 'map fanatic', 'habitual oatmeal eater', 'lower case advocate', 'the ignoble', 'bug fact purveyor', 'list writer', 'rumored fictional character',
    'have i mentioned software engineer already?',
    '...pls look at projects', '...or just click on any link', "is running out of autobiographical subheadings",
  ];

  const cycleDescription = () => {
    setDescription(descriptors[descriptionIdx]);
    setDescriptionIdx((descriptionIdx+1) % descriptors.length);
    setDescriptionCycling(true);
  };

  return (
    <div id="app-base" class={`${showLightning ? 'lightning' : ''}`}>
      <div className="content-wrapper">
        <h2 className="title">connor hopkins</h2>
        <h6 className="description-bar">
          <div 
            className="description"
            onClick={cycleDescription}
            style={{'color': descriptionCycling ? getRandomColor(50, 180).rgb : '#2C4E80'}}
          >
            <span className="bracket">{'{'}</span>
            <span className='description-text'>{` ${description} `}</span>
            <span className="bracket">{'}'}</span>
          </div>
        </h6>
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
        <Raincloud showLightning={showLightning} setShowLightning={setShowLightning}/>
        <Self/>
      </div>
    </div>
  );
}