import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './Home';
import Projects from './Projects';
import Wip from './Wip';

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
