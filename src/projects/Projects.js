import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import Raincloud from '../raincloud/Raincloud';

import '../styles/app.css';

export default function Projects() {
  const [showLightning, setShowLightning] = useState(false);

  useEffect(() => {
    document.getElementById("footer").style.backgroundColor = `${showLightning ? 'transparent' : ''}`;
  }, [showLightning])

  return (
    <div id="app-base" className={`proj-colors ${showLightning ? 'lightning' : ''}`}>
      <div className="content-wrapper proj-colors">
        <h2 className="title proj-colors">projects</h2>
        <h5 className="description proj-colors"> an assortment of web-accessible work </h5>
        <div className="links proj-colors">
          <a className="link proj-colors top left" href="https://thangs.com/designer/synnefon" rel="noreferrer">
            <p className="link-text proj-colors">3d models</p>
            <p className="tooltip-text proj-colors">a collection of my 3d-printable work</p>
          </a>
          <a className="link proj-colors top right" href="http://18.190.107.78" rel="noreferrer">
            <p className="link-text proj-colors">shufflenator</p>
            <p className="tooltip-text proj-colors">gives a card deck's optimal shuffle pattern</p>
          </a>
          <Link className="link proj-colors middle left" to="/wip" rel="noreferrer">
            <p className="link-text proj-colors">rpg tabletop</p>
            <p className="tooltip-text proj-colors">real-time updating battle maps, world maps, and images</p>
          </Link>
          <Link className="link proj-colors middle right" to="/wip" rel="noreferrer">
            <p className="link-text proj-colors">infinite terrain</p>
            <p className="tooltip-text proj-colors">a godot module that generates infinite terrains</p>
          </Link>
          <Link className="link proj-colors bottom left" to="/wip" rel="noreferrer">
            <p className="link-text proj-colors">toolbox</p>
            <p className="tooltip-text proj-colors">a set of useful little tools</p>
          </Link>
          {
              <Link className="link proj-colors bottom right" to="/snek" rel="noreferrer">
                <p className="link-text proj-colors">snek</p>
                <p className="tooltip-text proj-colors">snek!</p>
              </Link>
          }
        </div>
        <Raincloud showLightning={showLightning} setShowLightning={setShowLightning}/>
        <br />
      </div>
    </div>
  );
}