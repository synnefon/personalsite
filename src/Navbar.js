import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Hamburger from 'hamburger-react'

import './styles/navbar.css'

const iconMap = {
  about:    "about",
  skills:   "skills",
  projects: "projects",
  contact:  "contact",
};

const SECTION_IDS = {
  about: "about-section",
  skills: "skills-section",
  projects: "projects-section",
  contact: "contact-section",
};

const Navbar=()=>{
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [width, setWidth] = useState(window.innerWidth);
  const [activeSection, setActiveSection] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const isMobile = width <= 960;

  useEffect(() => {
    const handleWindowSizeChange = () => setWidth(window.innerWidth);
      window.addEventListener('resize', handleWindowSizeChange);
      return () => window.removeEventListener('resize', handleWindowSizeChange);
  }, [setWidth]);

  // Scroll-spy: on the merged page, highlight the section currently in
  // view and keep the url in step with it.
  useEffect(() => {
    const scroller = document.getElementById("app-base");
    if (!scroller || !document.getElementById(SECTION_IDS.about)) {
      setActiveSection(null);
      return;
    }

    const currentSection = () => {
      let current = "about";
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      if (atBottom) {
        current = Object.keys(SECTION_IDS).at(-1);
      } else {
        for (const [title, id] of Object.entries(SECTION_IDS)) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.4) {
            current = title;
          }
        }
      }
      return current;
    };

    const onScroll = () => {
      const current = currentSection();
      setActiveSection(current);
      const path = `/${current}`;
      if (location.pathname !== path) {
        navigate(path, { replace: true });
      }
    };

    setActiveSection(currentSection());
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [location.pathname, navigate]);

  // The menu only exists on the homepage sections
  if (!Object.keys(SECTION_IDS).some((t) => location.pathname === `/${t}`) && location.pathname !== "/") {
    return null;
  }

  const NavItem = ({title, to}) => {
    const closePopup = () => setTimeout(() => setHamburgerOpen(false), 200);
    const isActive = activeSection ? activeSection === title : location.pathname === to;
    return (
      <Link className={`nav-link ${title} ${isActive ? 'active' : ''}`} to={to} onClick={closePopup}>
        <span aria-label={title} className={`nav-item ${title} ${isActive ? 'active' : ''}`}>{iconMap[title]}</span>
      </Link>
    );
  };

  return (    
    <div className='navbar'>
      { isMobile && <Hamburger toggled={hamburgerOpen} toggle={setHamburgerOpen}/> }
      {
        (hamburgerOpen || !isMobile) && 
        <>
          <NavItem title={"about"} to={"/about"}/>
          <NavItem title={"skills"} to={"/skills"}/>
          <NavItem title={"projects"} to={"/projects"}/>
          <NavItem title={"contact"} to={"/contact"}/>
        </>
      }
    </div>
  );
}

export default Navbar;