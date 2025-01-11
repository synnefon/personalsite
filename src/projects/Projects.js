import { useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Snek from '../silliness/Snek';
import Raincloud from '../silliness/raincloud/Raincloud';

import '../styles/app.css';

export default function Projects() {
  const [windowWidth, setWindowWidth] = useState(0);
  const [showLightning, setShowLightning] = useState(false);
  
  useLayoutEffect(() => {
    const updateSize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', updateSize);
    updateSize();

    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return (
    <div id="app-base" class={`${showLightning ? 'lightning' : ''}`}>
      <div className="content-wrapper">
        <h2 className="title">projects</h2>
        <h5 className="description"> an assortment of web-accessible work </h5>
        <div className="links">
          <a className="link top left" href="https://thangs.com/designer/synnefon" rel="noreferrer">
            <p className="link-text">3d models</p>
            <p className="tooltip-text">a collection of my 3d-printable work</p>
          </a>
          <a className="link top right" href="http://18.190.107.78" rel="noreferrer">
            <p className="link-text">shufflenator</p>
            <p className="tooltip-text">gives a card deck's optimal shuffle pattern</p>
          </a>
          <Link className="link middle left" to="/wip" rel="noreferrer">
            <p className="link-text">rpg tabletop</p>
            <p className="tooltip-text">real-time updating battle maps, world maps, and images</p>
          </Link>
          <Link className="link middle right" to="/wip" rel="noreferrer">
            <p className="link-text">infinite terrain</p>
            <p className="tooltip-text">a godot module that generates infinite terrains</p>
          </Link>
          <Link className="link bottom left" to="/wip" rel="noreferrer">
            <p className="link-text">toolbox</p>
            <p className="tooltip-text">a set of useful little tools</p>
          </Link>
          {
            windowWidth > 1_000 ? 
              <Snek className="bottom right" onPage={false}/> : 
              <Link className="link bottom right" to="/snek" rel="noreferrer">
                <p className="link-text">snek</p>
                <p className="tooltip-text">snek!</p>
              </Link>
          }
        </div>
        <Raincloud showLightning={showLightning} setShowLightning={setShowLightning}/>
      </div>
    </div>
  );
}