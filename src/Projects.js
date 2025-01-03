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
          <a className="link-proj" href="http://18.190.107.78" rel="noreferrer">
            <p className="link-text">thing 1</p>
          </a>
          <a className="link-proj" href="http:/18.190.107.78" rel="noreferrer">
            <p className="link-text">thing 2</p>
          </a>
        </div>
      </div>
    </div>
  );
}