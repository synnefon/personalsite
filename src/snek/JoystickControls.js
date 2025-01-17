import { useState, useEffect } from 'react';
import Joystick, { Direction } from 'rc-joystick';

export const JoystickControls = ({setDirection}) => {
  const [currentDirection, setCurrentDirection] = useState();

  const onMove = (stick) => {
    if (currentDirection === stick.direction) return;
    if (stick.direction === Direction.Center) return;

    setCurrentDirection(stick.direction);
    setDirection(stick.direction);
  };

  useEffect(() => {
    document.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive:false });
  }, []);

  return <Joystick className='joystick' onChange={onMove}/>;
};
