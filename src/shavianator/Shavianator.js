import React, { useState } from "react";
import { shavianateSentence } from "./shavianating";

import "../styles/shavianator.css";

export default function Shavianator() {
  console.log(shavianateSentence("Hello world"));
  const [sentence, setSentence] = useState("");
  const [hoveredWord, setHoveredWord] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleSentenceChange = (e) => {
    setSentence(e.target.value);
  };

  const handleMouseEnter = (e, tooltip, tokenIndex) => {
    if (!tooltip) return;
    const rect = e.target.getBoundingClientRect();
    setTooltipPos({ x: rect.left, y: rect.bottom + 5 });
    setHoveredWord({ tooltip, index: tokenIndex });
  };

  const handleMouseLeave = () => {
    setHoveredWord(null);
  };

  const words = shavianateSentence(sentence);

  return (
    <div id="app-base" className="shavianator-colors">
      <div className="content-wrapper shavianator-colors">
        <h2 className="title shavianator-colors">shavianator</h2>
        <textarea
          className="shavianator-input"
          placeholder="Enter text to shavianate"
          value={sentence}
          onChange={handleSentenceChange}
          rows={5}
        />
        <div className="shavianator-output">
          {words.map((token, tokenIndex) => {
            const arpabets = token.chars
              .map((c) => c.arpabet)
              .filter((a) => a !== null);
            const tooltip = arpabets.length > 0 ? arpabets.join(" ") : null;

            return (
              <span
                key={tokenIndex}
                className="shavian-word"
                onMouseEnter={(e) => handleMouseEnter(e, tooltip, tokenIndex)}
                onMouseLeave={handleMouseLeave}
              >
                {token.chars.map((charObj, charIndex) => (
                  <span key={charIndex}>{charObj.char}</span>
                ))}
              </span>
            );
          })}
        </div>
        {hoveredWord && (
          <div
            className="shavian-tooltip"
            style={{
              position: "fixed",
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
            }}
          >
            {hoveredWord.tooltip}
          </div>
        )}
      </div>
    </div>
  );
}
