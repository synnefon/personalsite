import './App.css';

function App() {
  return (
    <div className="app-base">
      <body className="App-body">
        <div className="content-wrapper">
          <h2 className="title">Connor Hopkins</h2>
          <h6 className="description">Software Engineer, Thing-Maker, Dungeon Master, Fictional Character.</h6>
          <div className="links">
              <a className="link" href="https://github.com/synnefon" rel="noreferrer">
                <p className="link-text">github</p>
              </a>
              <a className="link" href="https://www.linkedin.com/in/connor-j-hopkins" rel="noreferrer">
                <p className="link-text">linkedin</p>
              </a>
              <a className="link" href="https://thangs.com/designer/synnefon" rel="noreferrer">
                <p className="link-text">3D models</p>
              </a>
          </div>
        </div>
      </body>
    </div>
  );
}

export default App;
