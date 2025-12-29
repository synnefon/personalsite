import { Route, HashRouter as Router, Routes } from 'react-router-dom';
import Game4096 from './4096/Game4096.tsx';
import Footer from './Footer';
import Navbar from './Navbar';
import About from './about/About';
import GameOfLife from './game_of_life/GameOfLife.tsx';
import Home from './home/Home';
import MatchGame from './match_game/MatchGame';
import Projects from './projects/Projects';
import Wip from './projects/Wip';
import Shavianator from './shavianator/Shavianator';
import Shufflenator from './shufflenator/Shufflenator';
import Snek from './snek/Snek';
import Sudoku from './sudoku/Sudoku';
import Toolbox from './toolbox/Toolbox.js';

function App() {
  return (
    <Router>
      <Navbar />
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
        <Route path="/4096" element={<Game4096 />} />
        <Route path="toolbox" element={<Toolbox />} />
      </Routes>
      <Footer />
    </Router>
  );
}

export default App;
