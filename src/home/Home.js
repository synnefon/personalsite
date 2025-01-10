import { Link } from 'react-router-dom';
import { TypeAnimation } from 'react-type-animation';

import '../styles/app.css';

export default function Home() {
  const descriptors = [
    'software engineer', 'thing maker', 'dungeon master', 'rock climber', 'cat dad', 'aspiring wood worker', 'crepuscular code creator', '3d printer mechanic',
    'bike lane survivor', ['slightly dysleixc', 'slightly dyslexic'], 'magic player', 'part-time audiophile', 'full-time wikipedia spelunker', 'human band name generator', 'fast reader, slow typer', 'secretly a gnome',
    'lava lamp enthusiast', 'map fanatic', 'habitual oatmeal eater', 'lower case advocate', 'the ignoble', 'bug fact purveyor', 'list writer', 'rumored fictional character',
    'have i mentioned software engineer already?', "",
    '...pls look at projects', '...or just click on any link', "is running out of autobiographical subheadings",
  ];
  const extractDescription = (descriptor) => {
    return descriptor.constructor === Array 
      ? [descriptor[0], 500, descriptor[1], 3_500] 
      : [descriptor, 3_000]
  }

  return (
    <div id="app-base" className='invert-color'>
      <div className="content-wrapper invert-color">
        <h2 className="title">connor hopkins</h2>
        <h5 className="description invert-color">
          <span className="bracket invert-color">{'{ '}</span>
          <TypeAnimation
            className='description-text invert-color'
            sequence={descriptors.flatMap((d) => extractDescription(d))}
            wrapper="span"
            deletionSpeed={60}
            repeat={Infinity}
          />
          <span className="bracket invert-color">{'}'}</span>
        </h5>
        <div className="links invert-color">
          <Link className="link top left invert-color" to="/aboutme" rel="noreferrer">
            <p className="link-text invert-color">about me</p>
            <p className="tooltip-text invert-color">$ whois connorhopkins.dev</p>
          </Link>
          <Link className="link top right invert-color" to="/projects" rel="noreferrer">
            <p className="link-text invert-color">projects</p>
            <p className="tooltip-text invert-color">an assortment of web-accessible work</p>
          </Link>
          <Link className="link middle left invert-color" to="/wip" rel="noreferrer">
            <p className="link-text invert-color">resume</p>
            <p className="tooltip-text invert-color">the list of stuff i've done professionally</p>
          </Link>
          <a className="link middle right invert-color" href="https://github.com/synnefon" rel="noreferrer">
            <p className="link-text invert-color">github</p>
            <p className="tooltip-text invert-color">where you can see some code i've written</p>
          </a>
          <a className="link bottom left invert-color" href="https://www.linkedin.com/in/connor-j-hopkins" rel="noreferrer">
            <p className="link-text invert-color">linkedin</p>
            <p className="tooltip-text invert-color">let's network!</p>
          </a>
          <Link className="link bottom right invert-color" to="/wip" rel="noreferrer">
            <p className="link-text invert-color">get in touch</p>
            <p className="tooltip-text invert-color">an email form</p>
          </Link>
        </div>
      </div>
    </div>
  );
}