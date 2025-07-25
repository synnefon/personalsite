import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Hamburger from 'hamburger-react'

import './styles/navbar.css'

const Navbar=()=>{
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [width, setWidth] = useState(window.innerWidth);

  const isMobile = width <= 500;

  useEffect(() => {
    const handleWindowSizeChange = () => setWidth(window.innerWidth);
      window.addEventListener('resize', handleWindowSizeChange);
      return () => window.removeEventListener('resize', handleWindowSizeChange);
  }, [setWidth]);

  const NavItem = ({title, to}) => {
    const closePopup = () => setTimeout(() => setHamburgerOpen(false), 200);
    return (
      <Link className={`nav-link ${title}`} to={to} onClick={closePopup}>
        <span className={`nav-icon ${title}`} aria-hidden="true" />
        <div className="nav-link-text">{title}</div>
      </Link>
    );
  };

  return (    
    <div className='navbar'>
      { isMobile && <Hamburger toggled={hamburgerOpen} toggle={setHamburgerOpen}/> }
      {
        (hamburgerOpen || !isMobile) && 
        <>
          <NavItem title={"home"} to={"/"}/>
          <NavItem title={"projects"} to={"/projects"}/>
          <NavItem title={"about"} to={"/about"}/>
        </>
      }
    </div>
  );
}

export default Navbar;