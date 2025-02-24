import { useEffect, useRef, useState } from 'react';

import '../styles/matchgame.css'
import { getFish } from '../Database';


function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const NUM_FISH = 108;

export default function MatchGame() {
  const [flipped1, setFlipped1] = useState(-1);
  const [flipped2, setFlipped2] = useState(-1);
  const [completeds, setCompleteds] = useState(Array.from({ length: 12 }).map(() => false));
  const [tries, setTries] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [images, setImages] = useState(Array.from({ length: 12 }).map(() => ""));
  const [imagesFound, setImagesFound] = useState(0);
  const foundFish = useRef([]);

  const [canDisplayBoard, setCanDisplayBoard] = useState(false);

  useEffect(() => {
    const fetchImages = async () => {
      const possibleVals = shuffle(Array.from({ length: NUM_FISH }).map((_, i) => i));
      for (let i in possibleVals.slice(0, 13)) {
        await getFish(possibleVals[i]).then(img => {
          setImages(imgs => {
            imgs[i] = img.val();
            return imgs;
          });
          setImagesFound(f => f+1);
        });
      }
    }
    fetchImages().then(() => setCanDisplayBoard(true));
  }, []);

  const checkCompleted = (idx, f1, f2) => {
    if (f1 % 12 === f2 % 12) {
      const newCompleteds = completeds.map((e, i) => i + 1 === idx ? true : e);
      foundFish.current.push(idx);
      setCompleteds(newCompleteds);
      if (newCompleteds.every(c => c)) setGameWon(true);
    } else {
      setTries(t => t + 1);
    }
    setFlipped1(-1);
    setFlipped2(-1);
  }

  const WinScreen = () => {
    return <div className='win-screen'>
      <p>YOU WIN!</p>
      <p className='win-details'>tries: {tries}</p>
      <div className="play-again" onClick={() => window.location.reload()}>play again?</div>
      <div className='fish-image-row'>
        {foundFish.current.map(i => {
          const img = images[i];
          return <img
            className="fish-image short"
            alt={`fish ${i}`}
            src={`data:image/png;base64,${img}`}
          />;
        })}
      </div>
    </div>
  }

  const FishImage = ({ id }) => {
    const idx = (id % 12) + 1;

    const flipUp = () => {
      if (flipped1 === id || flipped2 === id || flipped2 >= 0) return;
      if (flipped1 >= 0) {
        setFlipped2(id);
        setTimeout(() => checkCompleted(idx, flipped1, id), 1_200);
      } else {
        setFlipped1(id);
      }
    };

    const img = images[idx];

    return completeds[idx - 1]
      ? <div className="fish-image completed" />
    //   : <img
    //   className="fish-image"
    //   alt={`fish ${idx}`}
    //   src={`data:image/png;base64,${img}`}
    // />
      : flipped1 === id || flipped2 === id
        ? <img
          className="fish-image"
          alt={`fish ${idx}`}
          src={`data:image/png;base64,${img}`}
        />
        : <div onClick={flipUp} className="fish-image back">
            <div className='card-back-text'>?</div>
          </div>;
  }

  const LoadingBar = () => {
    const bars = Array.from({ length: imagesFound }).map(() => "█").join("");
    const antiBars = Array.from({ length: 24-imagesFound }).map(() => "░").join("");
    return (
      <div className='loading-bar'>
        {`loading critters: ${bars}${antiBars}`}
      </div>
    );
  }

  const shuffledIndexes = useRef(shuffle(Array.from({ length: 24 }).map((_, i) => i)));
  const fishImages = shuffledIndexes.current.map(i => <FishImage key={`fish_${i + 1}`} id={i} />);

  return (
    <div id='fish-match'>
      {canDisplayBoard 
        ? gameWon
            ? <WinScreen />
            : <div className='match-game'>
                <h1 className='match-title'>SEA MATCH</h1>
                <h4 className='miss-count'>tries: {tries}</h4>
                <div className='match-board'>
                  {fishImages}
                </div>
              </div>
          
        : <LoadingBar/>
      }
    </div>
  );
}