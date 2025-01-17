import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TypeAnimation } from 'react-type-animation';

import '../styles/app.css';

export default function Home() {
  const descriptors = [
    'software engineer', 'thing maker', 'dungeon master', 'rock climber', 'cat dad', 'amateur wood worker', 'crepuscular code creator', '3d printer mechanic',
    'bike lane survivor', ['mildly dysleixc', 'mildly dyslexic'], 'magic player', 'part-time audiophile', 'full-time wikipedia spelunker', 'human band name generator', 'secretly a gnome',
    'lava lamp enthusiast', 'map fanatic', 'habitual oatmeal eater', 'lower case advocate', 'the ignoble', 'bug fact purveyor', 'list writer', 'rumored fictional character',
    'have i mentioned software engineer already?', "   ",
    '...pls look at projects', '...or just click on any link', "is running out of autobiographical subheadings",
  ];

  useEffect(() => {document.getElementById("app-base").setAttribute('class', '')}, [])

  const extractDescription = (descriptor) => {
    return descriptor.constructor === Array 
      ? [descriptor[0], 500, descriptor[1], 3_500] 
      : [descriptor, 3_000]
  }

  return (
    <div id="app-base" className='home-colors'>
      <div className="content-wrapper home-colors">
        <h2 className="title">connor hopkins</h2>
        <h5 className="description home-colors">
          <span className="bracket home-colors">{'{ '}</span>
          <TypeAnimation
            className='description-text home-colors'
            sequence={descriptors.flatMap((d) => extractDescription(d))}
            wrapper="span"
            deletionSpeed={60}
            repeat={Infinity}
          />
          <span className="bracket home-colors">{'}'}</span>
        </h5>
        <div className="links home-colors">
          <Link className="link home-colors top left" to="/about" rel="noreferrer">
            <p className="link-text home-colors">about</p>
            <p className="tooltip-text home-colors">$ whois connorhopkins.dev</p>
          </Link>
          <Link className="link top right home-colors" to="/projects" rel="noreferrer">
            <p className="link-text home-colors">projects</p>
            <p className="tooltip-text home-colors">an assortment of web-accessible work</p>
          </Link>
          <a className="link middle left home-colors" href="https://docs.google.com/document/d/1A77LelAqhLE98pvkOYpHjUAs7l3LW-mcSQr-_MpbP6I" rel="noreferrer">
            <p className="link-text home-colors">resume</p>
            <p className="tooltip-text home-colors">the list of stuff i've done professionally</p>
          </a>
          <a className="link middle right home-colors" href="https://github.com/synnefon" rel="noreferrer">
            <p className="link-text home-colors">github</p>
            <p className="tooltip-text home-colors">where you can see some code i've written</p>
          </a>
          <a className="link bottom left home-colors" href="https://www.linkedin.com/in/connor-j-hopkins" rel="noreferrer">
            <p className="link-text home-colors">linkedin</p>
            <p className="tooltip-text home-colors">let's network!</p>
          </a>
          <a className="link bottom right home-colors" href="mailto:connorjhopkins@gmail.com?subject=let's%20collab!%20">
            <p className="link-text home-colors">get in touch</p>
            <p className="tooltip-text home-colors">shoot me an email</p>
          </a>
        </div>
      </div>
    </div>
  );
}