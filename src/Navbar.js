import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Hamburger from 'hamburger-react'

import './styles/navbar.css'
import homeIcon from './assets/nav_icons/duck.svg';
import projectsIcon from './assets/nav_icons/paper-plane.svg';
import aboutIcon from './assets/nav_icons/child-head.svg';

const iconMap = {
  home: homeIcon,
  projects: projectsIcon,
  about: aboutIcon,
};

const Navbar=()=>{
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [width, setWidth] = useState(window.innerWidth);
  const location = useLocation();

  const isMobile = width <= 500;

  useEffect(() => {
    const handleWindowSizeChange = () => setWidth(window.innerWidth);
      window.addEventListener('resize', handleWindowSizeChange);
      return () => window.removeEventListener('resize', handleWindowSizeChange);
  }, [setWidth]);

  const NavItem = ({title, to}) => {
    const closePopup = () => setTimeout(() => setHamburgerOpen(false), 200);
    const isActive = location.pathname === to;
    return (
      <Link className={`nav-link ${title} ${isActive ? 'active' : ''}`} to={to} onClick={closePopup}>
        <img src={iconMap[title]} alt={title} className={`nav-icon ${title} ${isActive ? 'active' : ''}`} />
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