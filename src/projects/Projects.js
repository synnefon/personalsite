import { Link } from 'react-router-dom';
import Snek from './Snek';
import '../styles/projects.css';


export default function Projects() {
  return (
    <div className="app-base">
      <div className="content-wrapper">
        <h2 className="title">projects</h2>
        <h6 className="description-bar">an assortment of web-accessible projects</h6>
        <div className="links-proj">
          <a className="link-proj" href="https://thangs.com/designer/synnefon" rel="noreferrer">
            <p className="link-text">3d models</p>
            <p className="tooltip-text">a collection of my 3d-printable work</p>
          </a>
          <a className="link-proj" href="http://18.190.107.78" rel="noreferrer">
            <p className="link-text">shufflenator</p>
            <p className="tooltip-text">gives a card deck's optimal shuffle pattern</p>
          </a>
          <Link className="link-proj" to="/wip" rel="noreferrer">
            <p className="link-text">virtual rpg tabletop</p>
            <p className="tooltip-text">real-time updating battle maps, world maps, and images</p>
          </Link>
          <Link className="link-proj" to="/wip" rel="noreferrer">
            <p className="link-text">infinite terrain gen</p>
            <p className="tooltip-text">a godot module that generates infinite terrains</p>
          </Link>
          <Link className="link-proj" to="/wip" rel="noreferrer">
            <p className="link-text">gmail automations</p>
            <p className="tooltip-text">for those who have too many emails in their inboxes</p>
          </Link>
          <Snek/>
        </div>
      </div>
    </div>
  );
}