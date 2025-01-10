import React from 'react';
import { Link } from 'react-router-dom';

import './styles/navbar.css'

const Navbar=()=>{
  return (    
    <div className='navbar'>
      <Link className='nav-link' to="/">
        <div className='nav-link-text'>home</div>
      </Link>
      <Link className='nav-link' to="/projects">
        <div className='nav-link-text'>projects</div>
      </Link>
      <Link className='nav-link' to="/about">
        <div className='nav-link-text'>about me</div>
      </Link>
    </div>
  );
}

export default Navbar;