import chroma from "chroma-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TypeAnimation } from "react-type-animation";

import "../styles/app.css";
import "../styles/home.css";

export default function Home() {
  const colors = ["#201658", "#1D24CA"];
  const [color, setColor] = useState(colors[0]);
  // const maxX = useRef(window.innerWidth);
  const maxY = useRef(window.innerHeight);
  const scale = chroma.scale([colors[0], colors[1]]);

  const onMouseMove = useCallback(
    (e) => {
      if (maxY.current > 0) {
        // const percentX = e.clientX / maxX.current;
        const percentY = e.clientY / maxY.current;
        // const average = (percentX + percentY) / 2;

        setColor(scale(percentY).hex());
      }
    },
    [scale]
  );

  const onResize = () => {
    // maxX.current = window.innerWidth;
    maxY.current = window.innerHeight;
  };

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [onMouseMove]);

  const descriptors = [
    "software engineer",
    "amateur wood worker",
    "dungeon master",
    "rock climber",
    "cat dad",
    "3d printer mechanic",
    "bike lane survivor",
    ["mildly dysleixc", "mildly dyslexic"],
    "magic player",
    "part-time audiophile",
    "full-time wikipedia spelunker",
    "human band name generator",
    "lava lamp enthusiast",
    "lower case advocate",
    "secretly a gnome",
    "the ignoble",
    "bug fact purveyor",
    "list writer",
    "rumored fictional character",
    "have i mentioned software engineer already?",
    "   ",
    "...pls look at projects",
    "...or just click on any link",
    "is running out of autobiographical subheadings",
    "   ",
  ];

  useEffect(() => {
    document.getElementById("app-base").setAttribute("class", "");
  }, []);

  const extractDescription = (descriptor) =>
    descriptor.constructor === Array
      ? [descriptor[0], 500, descriptor[1], 3_500]
      : [descriptor, 3_000];

  return (
    <div
      id="app-base"
      className="home-colors"
      style={{
        "--bg-color": color,
        "--inv-text-color": color,
      }}
    >
      <div className="content-wrapper home-colors">
        <h2 className="title">connor hopkins</h2>
        <h5 className="description home-colors">
          <span className="bracket home-colors">{'{'}&nbsp;</span>
          <TypeAnimation
            className="description-text home-colors"
            sequence={descriptors.flatMap((d) => extractDescription(d))}
            wrapper="span"
            deletionSpeed={60}
            repeat={Infinity}
          />
          <span className="bracket home-colors">{"}"}</span>
        </h5>
        <div className="links home-colors">
          <Link
            className="link top left home-colors"
            to="/projects"
            rel="noreferrer"
          >
            <p className="link-text home-colors">projects</p>
            <p className="tooltip-text home-colors">
              an assortment of web-accessible work
            </p>
          </Link>
          <Link
            className="link about home-colors top right"
            to="/about"
            rel="noreferrer"
          >
            <p className="link-text home-colors">about</p>
            <p className="tooltip-text home-colors">
              $ whois connorhopkins.dev
            </p>
          </Link>
          <a
            className="link resume middle left home-colors"
            href="https://docs.google.com/document/d/1A77LelAqhLE98pvkOYpHjUAs7l3LW-mcSQr-_MpbP6I"
            rel="noreferrer"
          >
            <p className="link-text home-colors">resume</p>
            <p className="tooltip-text home-colors">
              the list of stuff i've done professionally
            </p>
          </a>
          <a
            className="link middle right home-colors"
            href="https://github.com/synnefon"
            rel="noreferrer"
          >
            <p className="link-text home-colors">github</p>
            <p className="tooltip-text home-colors">
              where you can see some code i've written
            </p>
          </a>
          <a
            className="link bottom left home-colors"
            href="https://www.linkedin.com/in/connor-j-hopkins"
            rel="noreferrer"
          >
            <p className="link-text home-colors">linkedin</p>
            <p className="tooltip-text home-colors">let's network!</p>
          </a>
          <a
            className="link bottom right home-colors"
            href="mailto:connorjhopkins@gmail.com?subject=let's%20collab!%20"
          >
            <p className="link-text home-colors">get in touch</p>
            <p className="tooltip-text home-colors">shoot me an email</p>
          </a>
        </div>
      </div>
    </div>
  );
}
