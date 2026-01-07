import { createContext, useContext, useEffect, useState } from 'react';

const ColorBlindModeContext = createContext();

export const useColorBlindMode = () => {
  const context = useContext(ColorBlindModeContext);
  if (!context) {
    throw new Error('useColorBlindMode must be used within ColorBlindModeProvider');
  }
  return context;
};

export const ColorBlindModeProvider = ({ children }) => {
  const [isColorBlindMode, setIsColorBlindMode] = useState(() => {
    const saved = localStorage.getItem('colorBlindMode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('colorBlindMode', isColorBlindMode);
  }, [isColorBlindMode]);

  const toggleColorBlindMode = () => {
    setIsColorBlindMode(prev => !prev);
  };

  return (
    <ColorBlindModeContext.Provider value={{ isColorBlindMode, toggleColorBlindMode }}>
      {children}
    </ColorBlindModeContext.Provider>
  );
};
