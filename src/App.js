import { HashRouter as Router, Routes, Route} from 'react-router-dom';

import Home from './home/Home';
import Projects from './projects/Projects';
import AboutMe from './about me/AboutMe';
import Snek from './silliness/Snek';

import Wip from './projects/Wip';

function App() {
  return (
    <Router> 
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/aboutme" element={<AboutMe />} />
        <Route path="/snek" element={<Snek />} />
        <Route path="/wip" element={<Wip />} />
      </Routes>
    </Router> 
  );
}

export default App;
