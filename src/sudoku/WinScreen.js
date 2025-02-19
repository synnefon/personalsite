import { formatTime } from './Util';

import dancer from '../assets/sudoku/dancer.gif'
import { useEffect } from 'react';

export default function WinScreen({ timerMillis, toggleTime, mistakes, notesTaken }) {
  useEffect(() => toggleTime(false), [toggleTime]);

  const GameStat = ({ title, value }) => {
    return (
      <div className='game-stat-wrapper'>
        <div className='game-stat'>{title}</div>
        <div className='game-stat'>:</div>
        <div className='game-stat'>&nbsp;{value}</div>
      </div>
    );
  }

  return (
    <div className='sudoku-container win'>
      <div className='sudoku-win-text'>
        <p>you win!</p>
        <p className="again-button" onClick={() => window.location.reload()}>&nbsp;play again?</p>
      </div>
      <img alt="dancer man" src={dancer} />
      <div className='game-stats'>
        <GameStat title={"time spent"} value={formatTime(timerMillis)} />
        <GameStat title={"mistakes made"} value={mistakes} />
        <GameStat title={"notes taken"} value={notesTaken} />
      </div>
    </div>
  );
};
