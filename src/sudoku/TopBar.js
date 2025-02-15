import { useState } from "react";

export default function TopBar({mistakes, saveBoard, toggleTime, loadBoard}) {
  const [showPopup, setShowPopup] = useState(false);
  const loadAndClose = () => {
    loadBoard();
    togglePopup(false);
    toggleTime(true);
  };
  const togglePopup = (b) => {
    setShowPopup(b);
    toggleTime(b);
  };

  const ConfirmationPopup = ({loadAndClose}) => {
    return (
      <>
        {showPopup && <div className='confirmation-popup'>
          load previously saved data into board? 
          <div className='choice-button-row'>
            <button onClick={() => togglePopup(false)} className='choice-button'>nay</button>
            <button onClick={loadAndClose} className='choice-button'>yea</button>
          </div>
        </div>}
      </>
    );
  };

  return (
    <div className='save-load'>
      <button className="save-load-button" onClick={() => togglePopup(true)}>load game</button>
      <ConfirmationPopup loadAndClose={loadAndClose}/>
      <div className='mistakes'>mistakes: {mistakes}</div>
      <button className="save-load-button" onClick={saveBoard}>save game</button>
    </div>
  );
};
