import { useState } from "react";
import { formatTime } from './Util';

export default function TopBar({ mistakes, saveBoard, toggleTime, runTimer, loadBoard, timerMillis }) {
  const [showLoadPopup, setShowLoadPopup] = useState(false);
  const [showNotifyPopup, setShowNotifyPopup] = useState(false);
  const [NotifyPopupMsg, setNotifyPopupMsg] = useState("");
  const [savedRunTimer, setSavedRunTimer] = useState(runTimer);

  const onCloseLoadPopup = async ({ refreshBoard = false }) => {
    setShowLoadPopup(false);
    toggleTime(savedRunTimer);
    if (refreshBoard) {
      await loadBoard().then(result => {
        toggleNotifyPopup(result);
      })
    }
  };
  const onCloseAndLoad = () => onCloseLoadPopup({ refreshBoard: true });
  const onOpenLoadPopup = () => {
    setSavedRunTimer(runTimer);
    toggleTime(false);
    setShowLoadPopup(true);
  };

  const toggleNotifyPopup = (result) => {
    if (String(result).includes("Error")) {
      setNotifyPopupMsg(
        <div style={{ color: "red" }}>
          ERROR! {String(result)}
        </div>
      );
    } else {
      setNotifyPopupMsg("success!");
      setTimeout(() => setShowNotifyPopup(false), 2_000);
    }
    setShowNotifyPopup(true);
  }

  const onSave = async () => {
    await saveBoard().then(result => {
      toggleNotifyPopup(result);
    }).catch(e => console.log(e))
  }

  const LoadPopup = () => {
    return (
      <>
        {showLoadPopup && <div className='confirmation-popup'>
          <div className="popup-text">load previously saved data into board?</div>
          <div className='choice-button-row'>
            <button onClick={onCloseLoadPopup} className='choice-button'>
              nay
            </button>
            <button onClick={onCloseAndLoad} className='choice-button'>
              yea
            </button>
          </div>
        </div>}
      </>
    );
  };

  const NotifyPopup = () => {
    const content = <div className='confirmation-popup notify'>
      <div className="close-popup-button" onClick={() => setShowNotifyPopup(false)}>x</div>
      <div className="popup-text">{NotifyPopupMsg}</div>
    </div>;
    return (
      showNotifyPopup
        ? content
        : <></>
    );
  };

  return (
    <div className='sudoku-top-bar'>
      <div className={`timer-display${!runTimer ? ' paused' : ''}`} onClick={() => toggleTime(!runTimer)}>
        {formatTime(timerMillis)}
      </div>
      <div className='mistakes-display'>{mistakes}</div>
      <button className="save-load-button" onClick={onOpenLoadPopup}>
        <img alt="download" className="database download" />
        <div className="save-load-text">load game</div>
      </button>
      <LoadPopup />
      <NotifyPopup />
      <button className="save-load-button" onClick={onSave}>
        <img alt="upload" className="database upload" />
        <div className="save-load-text">save game</div>
      </button>
    </div>
  );
};
