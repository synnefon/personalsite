import { Link } from 'react-router-dom';
import './projects.css';


export default function Projects() {
  return (
    <div className="app-base">
      <div className="content-wrapper">
        <h2 className="title">projects</h2>
        <br/>
        <br/>
        <div className="links-proj">
          <a className="link-proj" href="https://thangs.com/designer/synnefon" rel="noreferrer">
            <p className="link-text">3D models</p>
          </a>
          <a className="link-proj" href="http://18.190.107.78" rel="noreferrer">
            <p className="link-text">shufflenator</p>
          </a>
          <Link className="link-proj" to="/wip" rel="noreferrer">
            <p className="link-text">infinite terrain gen</p>
          </Link>
          <Link className="link-proj" to="/wip" rel="noreferrer">
            <p className="link-text">virtual rpg tabletop</p>
          </Link>
          <Link className="link-proj" to="/wip" rel="noreferrer">
            <p className="link-text">gmail automations</p>
          </Link>
        </div>
      </div>
    </div>
  );
}