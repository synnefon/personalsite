import { HashRouter as Router, Routes, Route} from 'react-router-dom';

import Navbar from './Navbar';
import Home from './home/Home';
import Projects from './projects/Projects';
import AboutMe from './about me/AboutMe';
import Snek from './silliness/Snek';
import Copyright from './Copyright';

import Wip from './projects/Wip';

function App() {
  return (
    <Router> 
      <Navbar/>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/about" element={<AboutMe />} />
        <Route path="/snek" element={<Snek />} />
        <Route path="/wip" element={<Wip />} />
      </Routes>
      <Copyright/>
    </Router> 
  );
}

export default App;
