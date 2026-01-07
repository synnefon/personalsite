import { useColorBlindMode } from '../context/ColorBlindModeContext';
import eyeIcon from '../assets/snek/eye.svg';
import eyeCrossedIcon from '../assets/snek/eye-crossed.svg';

import './ColorBlindToggle.css';

const ColorBlindToggle = () => {
  const { isColorBlindMode, toggleColorBlindMode } = useColorBlindMode();

  return (
    <button
      className={`colorblind-toggle ${isColorBlindMode ? 'colorblind-mode' : 'regular-mode'}`}
      onClick={toggleColorBlindMode}
      aria-label={isColorBlindMode ? 'Switch to color mode' : 'Switch to colorblind-friendly mode'}
      title={isColorBlindMode ? 'Color mode' : 'Colorblind-friendly mode'}
    >
      <img
        src={isColorBlindMode ? eyeCrossedIcon : eyeIcon}
        alt={isColorBlindMode ? 'Eye crossed icon' : 'Eye icon'}
        className="colorblind-toggle-icon"
      />
    </button>
  );
};

export default ColorBlindToggle;
