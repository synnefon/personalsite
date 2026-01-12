import { lazy, Suspense, useEffect } from "react";
import { Route, HashRouter as Router, Routes, useLocation } from "react-router-dom";
import Footer from "./Footer";
import Navbar from "./Navbar";
import { ColorBlindModeProvider } from "./context/ColorBlindModeContext";
import Home from "./home/Home";

const Game4096 = lazy(() => import("./4096/Game4096.tsx"));
const About = lazy(() => import("./about/About"));
const GameOfLife = lazy(() => import("./game_of_life/GameOfLife.tsx"));
const LavaLamp = lazy(() => import("./lava_lamp/LavaLamp.tsx"));
const MatchGame = lazy(() => import("./match_game/MatchGame"));
const Projects = lazy(() => import("./projects/Projects"));
const Wip = lazy(() => import("./projects/Wip"));
const Shavianator = lazy(() => import("./shavianator/Shavianator"));
const Shufflenator = lazy(() => import("./shufflenator/Shufflenator"));
const Snek = lazy(() => import("./snek/Snek"));
const Sudoku = lazy(() => import("./sudoku/Sudoku"));
const Toolbox = lazy(() => import("./toolbox/Toolbox.js"));

function TitleUpdater() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const pageName = path === "/" ? "home" : path.substring(1);
    document.title = `connor.${pageName}`;
  }, [location]);

  return null;
}

function App() {
  return (
    <ColorBlindModeProvider>
      <Router>
        <TitleUpdater />
        <Navbar />
        <Suspense
          fallback={
            <div style={{ padding: "2rem", textAlign: "center" }}>
              Loading...
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/about" element={<About />} />
            <Route path="/snek" element={<Snek />} />
            <Route path="/wip" element={<Wip />} />
            <Route path="/sudoku" element={<Sudoku />} />
            <Route path="/matchgame" element={<MatchGame />} />
            <Route path="/shufflenator" element={<Shufflenator />} />
            <Route path="/shavianator" element={<Shavianator />} />
            <Route path="/game-of-life" element={<GameOfLife />} />
            <Route path="/lava-lamp-radio" element={<LavaLamp />} />
            <Route path="/4096" element={<Game4096 />} />
            <Route path="toolbox" element={<Toolbox />} />
          </Routes>
        </Suspense>
        <Footer />
      </Router>
    </ColorBlindModeProvider>
  );
}

export default App;
