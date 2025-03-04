import { HashRouter as Router, Routes, Route} from 'react-router-dom';
import Footer from './Footer';
import Navbar from './Navbar';
import Home from './home/Home';
import Projects from './projects/Projects';
import About from './about/About';
import Snek from './snek/Snek';
import Wip from './projects/Wip';
import Sudoku from './sudoku/Sudoku';
import MatchGame from './match_game/MatchGame'
import Shufflenator from './shufflenator/Shufflenator';

function App() {
  return (
    <Router> 
      <Navbar/>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/about" element={<About />} />
        <Route path="/snek" element={<Snek />} />
        <Route path="/wip" element={<Wip />} />
        <Route path="/sudoku" element={<Sudoku />} />
        <Route path="/matchgame" element={<MatchGame />} />
        <Route path="/shufflenator" element={<Shufflenator />} />
      </Routes>
      <Footer/>
    </Router> 
  );
}

export default App;
