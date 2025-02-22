import { useRef, useState } from 'react';
import '../styles/bugmatch.css'

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export default function BugMatch() {
  const [flipped1, setFlipped1] = useState(-1);
  const [flipped2, setFlipped2] = useState(-1);
  const [completeds, setCompleteds] = useState(Array.from({ length: 12 }).map(() => false));
  const [tries, setTries] = useState(0);
  const [gameWon, setGameWon] = useState(false);

  const checkCompleted = (idx, f1, f2) => {
    if (f1 % 12 === f2 % 12) {
      const newCompleteds = completeds.map((e, i) => i+1 === idx ? true : e);
      setCompleteds(newCompleteds);
      if (newCompleteds.every(c => c)) setGameWon(true);
    } else {
      setTries(t => t+1);
    }
    setFlipped1(-1);
    setFlipped2(-1);
  }

  const WinScreen = () => {
    return <div className='win-screen'>
      <p>YOU WIN!</p>
      <p className='win-details'>tries: {tries}</p>
    </div>
  }

  const BugImage = ({id}) => {
    const idx = (id % 12)+1;

    const flipUp = () => {
      if (flipped1 === id || flipped2 === id || flipped2 >= 0) return;
      if (flipped1 >= 0) {
        setFlipped2(id);
        setTimeout(() => checkCompleted(idx, flipped1, id), 1_200);
      } else {
        setFlipped1(id);
      }
    };
    
    const img = require(`../assets/bug_match/bug_${idx}.png`);

    return completeds[idx-1]
    ? <div className="bug-image completed"/>
    : flipped1 === id || flipped2 === id
      ? <img 
          className="bug-image"
          alt={`bug ${idx}`}
          src={img}
        />
      : <div
          onClick={flipUp}
          className="bug-image red"
        />;
  }
  
  const shuffledIndexes = useRef(shuffle(Array.from({ length: 24 }).map((_, i) => i)));
  const bugImages = shuffledIndexes.current.map(i => <BugImage key={`bug_${i+1}`} id={i}/>);

  return (
    <div id='bug-match'>
      {gameWon 
        ? <WinScreen/>
        : <>
          <h4 className='miss-count'>tries: {tries}</h4>
          <div className='match-board'>
            {bugImages}
          </div>
        </>
      }
    </div>
  );
}