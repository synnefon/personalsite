import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Hamburger from 'hamburger-react'

import './styles/navbar.css'

const Navbar=()=>{
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [width, setWidth] = useState(window.innerWidth);

  const isMobile = width <= 768;

  useEffect(() => {
    const handleWindowSizeChange = () => setWidth(window.innerWidth);
      window.addEventListener('resize', handleWindowSizeChange);
      return () => window.removeEventListener('resize', handleWindowSizeChange);
  }, [setWidth]);

  return (    
    <div className='navbar'>
      {(hamburgerOpen || !isMobile) && 
      <>
        <Link className='nav-link' to="/">
          <div className='nav-link-text'>home</div>
        </Link>
        <Link className='nav-link' to="/about">
          <div className='nav-link-text'>about</div>
        </Link>
        <Link className='nav-link' to="/projects">
          <div className='nav-link-text'>projects</div>
        </Link>
      </>
    }
      {isMobile && <Hamburger toggled={hamburgerOpen} toggle={setHamburgerOpen} />}
    </div>
  );
}

export default Navbar;