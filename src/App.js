import { HashRouter as Router, Routes, Route} from 'react-router-dom';
import Footer from './Footer';

import Navbar from './Navbar';
import Home from './home/Home';
import Projects from './projects/Projects';
import AboutMe from './about/AboutMe';
import Snek from './silliness/Snek';

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
      <Footer/>
    </Router> 
  );
}

export default App;
