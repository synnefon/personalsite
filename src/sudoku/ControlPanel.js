import { formatTime } from './Util';

export default function ControlPanel({onUndo, onRedo, runTimer, toggleTime, timerMillis, takingNotes, setTakingNotes}) {
  return (
    <div className='sudoku-control-panel'>
      <div className={`sudoku-control-pane undo`} onClick={onUndo}>
        <img alt="undo icon" className='control img undo' />
        <p className='control undo'>undo</p>
      </div>
      <div className={`sudoku-control-pane redo`} onClick={onRedo}>
        <img alt="redo icon" className='control img redo' />
        <p className='control redo'>redo</p>
      </div>
      <div className={`sudoku-control-pane timer`} onClick={() => toggleTime(!runTimer)}>
        <img alt="timer icon" className='control timer' />
        <p className={`control timer${runTimer ? "" : " selected"}`}>
          {formatTime(timerMillis)}
        </p>
      </div>
      <div
        className={`sudoku-control-pane pencil${takingNotes ? " selected" : ""}`}
        onClick={() => setTakingNotes(b => !b)}
      >
        <img alt="pencil icon" className="control pencil" />
        <p className='control pencil'>notes</p>
      </div>
    </div>
  );
};
