import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { SECTIONS } from './home/Home';

import './styles/navbar.css'

const Navbar=()=>{
  const [activeSection, setActiveSection] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Scroll-spy: on the merged page, highlight the section currently in
  // view and keep the url in step with it.
  useEffect(() => {
    const scroller = document.getElementById("app-base");
    if (!scroller || !document.getElementById(SECTIONS[0].id)) {
      setActiveSection(null);
      return;
    }

    // At the extremes the first/last section wins outright, since
    // several section headers can share the viewport there.
    const currentSection = () => {
      const atTop = scroller.scrollTop <= 2;
      if (atTop) return SECTIONS[0].slug;

      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      if (atBottom) return SECTIONS.at(-1).slug;

      let current = SECTIONS[0].slug;
      for (const { slug, id } of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.4) {
          current = slug;
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
  if (!SECTIONS.some((s) => location.pathname === `/${s.slug}`) && location.pathname !== "/") {
    return null;
  }

  const NavItem = ({slug, label, color}) => {
    const to = `/${slug}`;
    const isActive = activeSection ? activeSection === slug : location.pathname === to;
    return (
      <Link
        className={`nav-link ${slug} ${isActive ? 'active' : ''}`}
        to={to}
        style={color ? { "--section-color": color } : undefined}
      >
        <span aria-label={label} className={`nav-item ${slug} ${isActive ? 'active' : ''}`}>{label}</span>
      </Link>
    );
  };

  // The overlay eats wheel events, so hand them to the page scroller.
  const forwardWheel = (e) => {
    const scroller = document.getElementById("app-base");
    if (scroller) scroller.scrollTop += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
  };

  return (
    <div className='navbar' onWheel={forwardWheel}>
      {SECTIONS.map(({slug, label, color}) => <NavItem key={slug} slug={slug} label={label} color={color}/>)}
    </div>
  );
}

export default Navbar;