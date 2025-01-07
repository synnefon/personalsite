import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Home from './home/Home';
import Projects from './projects/Projects';
import Wip from './projects/Wip';

function App() {
  return (
    <BrowserRouter> 
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/wip" element={<Wip />} />
      </Routes>
    </BrowserRouter> 
  );
}

export default App;
