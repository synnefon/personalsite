import React, { useState, useRef, useEffect } from "react";
import { shavianateSentence } from "./shavianating";

import "../styles/shavianator.css";

export default function Shavianator() {
  const [sentence, setSentence] = useState("");
  const [hoveredWord, setHoveredWord] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const outputRef = useRef(null);

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

  const handleCopy = () => {
    const shavianText = words
      .map((token) => token.chars.map((c) => c.char).join(""))
      .join("");
    navigator.clipboard.writeText(shavianText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const words = shavianateSentence(sentence);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [sentence]);

  return (
    <div id="app-base" className="shavianator-colors">
      <div className="content-wrapper shavianator-colors">
        <h2 className="title shavianator-colors">shavianator</h2>
        <div className="shavianator-layout">
          <div className="shavianator-input-container">
            <label className="shavianator-label">english</label>
            <textarea
              className="shavianator-input"
              placeholder="Enter text to shavianate"
              value={sentence}
              onChange={handleSentenceChange}
              rows={5}
            />
          </div>
          <div className="shavianator-output-container">
            <label className="shavianator-label">shavian</label>
            <div className="shavianator-output" ref={outputRef}>
              <button
                className="copy-button"
                onClick={handleCopy}
                title={copied ? "Copied!" : "Copy to clipboard"}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {copied ? (
                    <path d="M20 6L9 17l-5-5" />
                  ) : (
                    <>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </>
                  )}
                </svg>
              </button>
              {words.map((token, tokenIndex) => {
                const arpabets = token.chars
                  .map((c) => c.arpabet)
                  .filter((a) => a !== null);
                const tooltip = arpabets.length > 0 ? arpabets.join(" ") : null;
                const hasTranslation = tooltip !== null;

                return (
                  <span
                    key={tokenIndex}
                    className={hasTranslation ? "shavian-word" : ""}
                    onMouseEnter={
                      hasTranslation
                        ? (e) => handleMouseEnter(e, tooltip, tokenIndex)
                        : undefined
                    }
                    onMouseLeave={hasTranslation ? handleMouseLeave : undefined}
                  >
                    {token.chars.map((charObj, charIndex) => (
                      <span key={charIndex}>{charObj.char}</span>
                    ))}
                  </span>
                );
              })}
            </div>
          </div>
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
