import React, { useEffect, useRef, useState } from "react";
import "../styles/shavianator.css";
import { getArpabetFromShavian } from "./shavianating";

const toShavian = require("to-shavian");

export default function Shavianator() {
  const [paragraphs, setParagraphs] = useState("");
  const [copied, setCopied] = useState(false);
  const [hoveredWordIndex, setHoveredWordIndex] = useState(null);
  const outputRef = useRef(null);
  const inputDisplayRef = useRef(null);
  const textareaRef = useRef(null);
  const [tooltip, setTooltip] = useState({ show: false, text: "", x: 0, y: 0 });
  const tooltipRef = useRef(null);

  const handleChange = (e) => setParagraphs(e.target.value);

  // Parse text into tokens with word mappings
  const parseTextIntoTokens = (text) => {
    const tokens = [];
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        tokens.push({ type: 'newline', english: '\n', shavian: '\n', index: null });
      }

      const parts = line.split(/(\s+)/);
      parts.forEach((part) => {
        if (!part) return;

        if (/^\s+$/.test(part)) {
          // Whitespace
          tokens.push({ type: 'whitespace', english: part, shavian: part, index: null });
        } else {
          // Word (might include punctuation)
          const wordIndex = tokens.filter(t => t.type === 'word').length;
          const shavian = toShavian(part);
          tokens.push({ type: 'word', english: part, shavian, index: wordIndex });
        }
      });
    });

    return tokens;
  };

  const tokens = parseTextIntoTokens(paragraphs);

  const handleCopy = () => {
    const shavianText = tokens.map(t => t.shavian).join('');
    navigator.clipboard.writeText(shavianText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Sync the scroll positions
  useEffect(() => {
    const textarea = textareaRef.current;
    const inputDisplay = inputDisplayRef.current;
    const output = outputRef.current;

    if (!textarea || !inputDisplay || !output) return;

    const handleTextareaScroll = () => {
      inputDisplay.scrollTop = textarea.scrollTop;
      inputDisplay.scrollLeft = textarea.scrollLeft;

      const scrollPercentage =
        textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight || 1);
      output.scrollTop = scrollPercentage * (output.scrollHeight - output.clientHeight);
    };

    const handleOutputScroll = () => {
      const scrollPercentage =
        output.scrollTop / (output.scrollHeight - output.clientHeight || 1);
      textarea.scrollTop = scrollPercentage * (textarea.scrollHeight - textarea.clientHeight);
      inputDisplay.scrollTop = textarea.scrollTop;
    };

    textarea.addEventListener("scroll", handleTextareaScroll);
    output.addEventListener("scroll", handleOutputScroll);

    return () => {
      textarea.removeEventListener("scroll", handleTextareaScroll);
      output.removeEventListener("scroll", handleOutputScroll);
    };
  }, []);

  const handleWordClick = (e, token, isShavian) => {
    if (!isShavian && textareaRef.current) {
      // Clicked on English word - focus textarea and position cursor at start of word
      const textarea = textareaRef.current;
      textarea.focus();

      // Find the position of this word in the text
      let pos = 0;
      for (const t of tokens) {
        if (t === token) break;
        if (t.type === 'newline') {
          pos += 1;
        } else {
          pos += t.english.length;
        }
      }

      textarea.setSelectionRange(pos, pos);
      e.stopPropagation();
    }
  };

  const handleWordMouseEnter = (e, word, wordIndex, isShavian) => {
    setHoveredWordIndex(wordIndex);

    const arpabet = getArpabetFromShavian(word);

    if (isShavian) {
      // Hovering over Shavian word - use its position
      const rect = e.target.getBoundingClientRect();
      setTooltip({
        show: true,
        text: arpabet,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    } else {
      // Hovering over English word - find corresponding Shavian word
      const shavianWord = document.querySelector(
        `.shavianator-output .shavian-word[data-word-index="${wordIndex}"]`
      );
      if (shavianWord) {
        const rect = shavianWord.getBoundingClientRect();
        setTooltip({
          show: true,
          text: arpabet,
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      }
    }
  };

  const handleWordMouseLeave = () => {
    setHoveredWordIndex(null);
    setTooltip({ show: false, text: "", x: 0, y: 0 });
  };

  // Render tokens with highlighting
  const renderTokens = (tokens, isShavian = false) => {
    return tokens.map((token, index) => {
      const text = isShavian ? token.shavian : token.english;

      if (token.type === 'newline') {
        return <br key={index} />;
      }

      if (token.type === 'whitespace') {
        return <span key={index}>{text}</span>;
      }

      if (token.type === 'word') {
        const isHovered = token.index === hoveredWordIndex;
        return (
          <span
            key={index}
            className={`shavian-word ${isHovered ? 'highlighted' : ''}`}
            data-word-index={token.index}
            onMouseEnter={(e) => handleWordMouseEnter(e, token.shavian, token.index, isShavian)}
            onMouseLeave={handleWordMouseLeave}
            onClick={(e) => handleWordClick(e, token, isShavian)}
          >
            {text}
          </span>
        );
      }

      return null;
    });
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
                value={paragraphs}
                onChange={handleChange}
                rows={5}
              />
              <div
                ref={inputDisplayRef}
                className="shavianator-input shavianator-input-overlay"
              >
                {renderTokens(tokens, false)}
              </div>
            </div>
          </div>
          <div className="shavianator-output-container">
            <label className="shavianator-label">shavian</label>
            <div
              className="shavianator-output"
              ref={outputRef}
            >
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
              {renderTokens(tokens, true)}
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
                  {tooltip.text}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
