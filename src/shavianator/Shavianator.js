import React, { useEffect, useRef, useState } from "react";
import "../styles/shavianator.css";
import { getArpabetFromShavian, tokenizeText } from "./shavianating";

export default function Shavianator() {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState({ show: false, word: "", arpabet: "", x: 0, y: 0 });
  const textareaRef = useRef();
  const inputOverlayRef = useRef();
  const outputRef = useRef();
  const tooltipRef = useRef();

  const tokens = tokenizeText(text);

  // Sync scroll positions
  useEffect(() => {
    const textarea = textareaRef.current, overlay = inputOverlayRef.current, output = outputRef.current;
    if (!textarea || !overlay || !output) return;

    const tScroll = () => {
      overlay.scrollTop = textarea.scrollTop;
      overlay.scrollLeft = textarea.scrollLeft;
      output.scrollTop = (textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight || 1)) * (output.scrollHeight - output.clientHeight);
    };
    const oScroll = () => {
      textarea.scrollTop = (output.scrollTop / (output.scrollHeight - output.clientHeight || 1)) * (textarea.scrollHeight - textarea.clientHeight);
      overlay.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("scroll", tScroll);
    output.addEventListener("scroll", oScroll);
    return () => {
      textarea.removeEventListener("scroll", tScroll);
      output.removeEventListener("scroll", oScroll);
    };
  }, []);

  // Copy Shavian output
  const handleCopy = () => {
    navigator.clipboard.writeText(tokens.map(t => t.shavian).join(""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Word highlight/cursor placing
  const handleWordClick = (e, token) => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      let pos = 0;
      for (const t of tokens) {
        if (t === token) break;
        pos += t.type === "newline" ? 1 : t.english.length;
      }
      textareaRef.current.setSelectionRange(pos, pos);
      e.stopPropagation();
    }
  };

  // Tooltip logic
  const handleMouseEnter = (e, shavianWord, idx, isShavian) => {
    setHovered(idx);
    const arpabet = getArpabetFromShavian(shavianWord);

    // Only show tooltip if there's actual content
    const shavianChars = [...shavianWord.replace(/[^\u{10450}-\u{1047F}]/gu, "")];
    const phonemes = arpabet.split(" ").filter(Boolean);
    if (shavianChars.length === 0 || phonemes.length === 0) return;

    let rect;
    if (isShavian) {
      rect = e.target.getBoundingClientRect();
    } else {
      const el = document.querySelector(`.shavianator-output .shavian-word[data-word-index="${idx}"]`);
      rect = el?.getBoundingClientRect();
    }
    if (rect) setTooltip({ show: true, word: shavianWord, arpabet, x: rect.left + rect.width / 2, y: rect.top });
  };
  const handleMouseLeave = () => {
    setHovered(null);
    setTooltip({ show: false, word: "", arpabet: "", x: 0, y: 0 });
  };

  // Token renderer
  const renderTokens = (isShavian = false) =>
    tokens.map((token, i) => {
      const text = isShavian ? token.shavian : token.english;
      if (token.type === "newline") return <br key={i} />;
      if (token.type === "whitespace" || token.type === "punctuation")
        return <span key={i}>{text}</span>;
      if (token.type === "word")
        return (
          <span
            key={i}
            className={`shavian-word${hovered === token.index ? " highlighted" : ""}`}
            data-word-index={token.index}
            onMouseEnter={e => handleMouseEnter(e, token.shavian, token.index, isShavian)}
            onMouseLeave={handleMouseLeave}
            onClick={e => !isShavian && handleWordClick(e, token)}
          >
            {text}
          </span>
        );
      return null;
    });

  // Tooltip grid
  const TooltipGrid = ({ word, arpabet }) => {
    const shavianChars = [...word.replace(/[^\u{10450}-\u{1047F}]/gu, "")];
    const phonemes = arpabet.split(" ").filter(Boolean);
    return (
      <div className="shavian-tooltip-grid">
        <div className="shavian-tooltip-row shavian-tooltip-word">
          {shavianChars.map((char, i) => (
            <div key={`c${i}`} className="shavian-tooltip-cell">{char}</div>
          ))}
        </div>
        <div className="shavian-tooltip-row shavian-tooltip-pronunciation">
          {phonemes.map((p, i) => (
            <div key={`p${i}`} className="shavian-tooltip-cell">{p}</div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div id="app-base" className="shavianator-colors">
      <div className="content-wrapper shavianator-colors">
        <h2 className="title shavianator-colors">shavianator</h2>
        <div className="shavianator-layout">
          <div className="shavianator-input-container">
            <label className="shavianator-label">english</label>
            <div className="shavianator-input-wrapper">
              <textarea
                ref={textareaRef}
                className="shavianator-input shavianator-textarea"
                placeholder="Enter text to shavianate"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={5}
              />
              <div
                ref={inputOverlayRef}
                className="shavianator-input shavianator-input-overlay"
              >
                {renderTokens(false)}
              </div>
            </div>
          </div>
          <div className="shavianator-output-container">
            <label className="shavianator-label">shavian</label>
            <div className="shavianator-output" ref={outputRef}>
              <button
                className="copy-button"
                onClick={handleCopy}
                title={copied ? "Copied!" : "Copy to clipboard"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              {renderTokens(true)}
              {tooltip.show && (
                <div
                  ref={tooltipRef}
                  className="shavian-tooltip"
                  style={{
                    position: "fixed",
                    left: `${tooltip.x}px`,
                    top: `${tooltip.y}px`,
                    transform: "translate(-50%, -100%)",
                    marginTop: "-8px",
                  }}
                >
                  <TooltipGrid word={tooltip.word} arpabet={tooltip.arpabet} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
