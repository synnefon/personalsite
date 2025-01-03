import { Link } from 'react-router-dom';
import './app.css';

export default function Home() {
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
      </div>
    </div>
  );
}