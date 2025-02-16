import { useState } from "react";

export default function TopBar({mistakes, saveBoard, toggleTime, runTimer, loadBoard}) {
  const [showPopup, setShowPopup] = useState(false);
  const [savedRunTimer, setSavedRunTimer] = useState(runTimer);

  const closePopup = async ({refreshBoard = false}) => {
    setShowPopup(false);
    toggleTime(savedRunTimer);
    if (refreshBoard) loadBoard();
  };
  const closeAndLoad = () => closePopup({refreshBoard: true});
  const openPopup = () => {
    setSavedRunTimer(runTimer);
    toggleTime(false);
    setShowPopup(true);
  };

  const ConfirmationPopup = () => {
    return (
      <>
        {showPopup && <div className='confirmation-popup'>
          load previously saved data into board? 
          <div className='choice-button-row'>
            <button onClick={closePopup} className='choice-button'>
              nay
            </button>
            <button onClick={closeAndLoad} className='choice-button'>
              yea
            </button>
          </div>
        </div>}
      </>
    );
  };

  return (
    <div className='save-load'>
      <button className="save-load-button" onClick={openPopup}>
        <img alt="download" className="database download"/>
        <div className="save-load-text">load game</div>
      </button>
      <ConfirmationPopup/>
      <div className='mistakes'>mistakes: {mistakes}</div>
      <button className="save-load-button" onClick={saveBoard}>
        <img alt="upload" className="database upload"/>
        <div className="save-load-text">save game</div>
      </button>
    </div>
  );
};
