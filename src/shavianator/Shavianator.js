import React, { useEffect, useRef, useState } from "react";
import "../styles/shavianator.css";
import { getArpabetFromShavian, tokenizeText, TokenType } from "./shavianating";

export default function Shavianator() {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState({
    show: false,
    word: "",
    arpabet: "",
    x: 0,
    y: 0,
  });

  const textareaRef = useRef(),
    inputOverlayRef = useRef(),
    outputRef = useRef(),
    tooltipRef = useRef();
  const tokens = tokenizeText(text);

  // Sync scroll between textareas
  useEffect(() => {
    const textarea = textareaRef.current,
      inputOverlay = inputOverlayRef.current,
      outputArea = outputRef.current;
    if (!textarea || !inputOverlay || !outputArea) return;

    const handleTextareaScroll = () => {
      inputOverlay.scrollTop = textarea.scrollTop;
      inputOverlay.scrollLeft = textarea.scrollLeft;
      outputArea.scrollTop =
        (textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight || 1)) *
        (outputArea.scrollHeight - outputArea.clientHeight);
    };

    const handleOverlayScroll = () => {
      textarea.scrollTop = inputOverlay.scrollTop;
      textarea.scrollLeft = inputOverlay.scrollLeft;
      outputArea.scrollTop =
        (textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight || 1)) *
        (outputArea.scrollHeight - outputArea.clientHeight);
    };

    const handleOutputScroll = () => {
      textarea.scrollTop =
        (outputArea.scrollTop / (outputArea.scrollHeight - outputArea.clientHeight || 1)) *
        (textarea.scrollHeight - textarea.clientHeight);
      inputOverlay.scrollTop = textarea.scrollTop;
    };

    textarea.addEventListener("scroll", handleTextareaScroll);
    inputOverlay.addEventListener("scroll", handleOverlayScroll);
    outputArea.addEventListener("scroll", handleOutputScroll);

    return () => {
      textarea.removeEventListener("scroll", handleTextareaScroll);
      inputOverlay.removeEventListener("scroll", handleOverlayScroll);
      outputArea.removeEventListener("scroll", handleOutputScroll);
    };
  }, []);

  // Copy output to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(tokens.map((t) => t.shavian).join(""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Place caret on word click
  const handleWordClick = (e, token) => {
    if (!textareaRef.current) return;
    textareaRef.current.focus();
    let pos = 0;
    for (const t of tokens) {
      if (t === token) break;
      pos += t.type === TokenType.NEWLINE ? 1 : t.english.length;
    }
    textareaRef.current.setSelectionRange(pos, pos);
    e.stopPropagation();
  };

  // Tooltip position correction
  useEffect(() => {
    if (!tooltip.show || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect(),
      w = window.innerWidth;
    let x = tooltip.x;
    if (rect.left < 10) x += 10 - rect.left;
    else if (rect.right > w - 10) x -= rect.right - (w - 10);
    if (x !== tooltip.x) setTooltip((t) => ({ ...t, x }));
  }, [tooltip.show, tooltip.x]);

  // Tooltip display events
  const handleMouseEnter = (e, shavian, idx, isShavian) => {
    setHovered(idx);
    const arpabet = getArpabetFromShavian(shavian);
    const shavianChars = [...shavian.replace(/[^\u{10450}-\u{1047F}]/gu, "")];
    if (!shavianChars.length || !arpabet.split(" ").filter(Boolean).length)
      return;
    let rect;
    if (isShavian) rect = e.target.getBoundingClientRect();
    else
      rect = document
        .querySelector(
          `.shavianator-output .shavian-word[data-word-index="${idx}"]`
        )
        ?.getBoundingClientRect();
    if (rect)
      setTooltip({
        show: true,
        word: shavian,
        arpabet,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
  };
  const handleMouseLeave = () => {
    setHovered(null);
    setTooltip({ show: false, word: "", arpabet: "", x: 0, y: 0 });
  };

  // Token renderer
  const renderTokens = (isShavian) =>
    tokens.map((token, i) => {
      const text = isShavian ? token.shavian : token.english;
      if (token.type === TokenType.NEWLINE) return <br key={i} />;
      if (token.type !== TokenType.WORD) return <span key={i}>{text}</span>;
      return (
        <span
          key={i}
          className={`shavian-word${
            hovered === token.index ? " highlighted" : ""
          }`}
          data-word-index={token.index}
          onMouseEnter={(e) =>
            handleMouseEnter(e, token.shavian, token.index, isShavian)
          }
          onMouseLeave={handleMouseLeave}
          onClick={(e) => !isShavian && handleWordClick(e, token)}
        >
          {text}
        </span>
      );
    });

  // Tooltip grid component
  const TooltipGrid = ({ word, arpabet }) => {
    const shavianChars = [...word.replace(/[^\u{10450}-\u{1047F}]/gu, "")];
    const phonemes = arpabet.split(" ").filter(Boolean);
    return (
      <div className="shavian-tooltip-grid">
        <div className="shavian-tooltip-row shavian-tooltip-word">
          {shavianChars.map((c, i) => (
            <div key={i} className="shavian-tooltip-cell">
              {c}
            </div>
          ))}
        </div>
        <div className="shavian-tooltip-row shavian-tooltip-pronunciation">
          {phonemes.map((p, i) => (
            <div key={i} className="shavian-tooltip-cell">
              {p}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div id="app-base" className="shavianator-colors">
      <div className="content-wrapper shavianator-colors">
        <h2 className="title shavianator-colors">shavianator</h2>
        <p className="shavianator-description">
          a tool for transliterating english to{" "}
          <a
            href="https://en.wikipedia.org/wiki/Shavian_alphabet"
            target="_blank"
            rel="noopener noreferrer"
          >
            shavian
          </a>
          .
          <br />
          𐑱 𐑑𐑵𐑤 𐑓𐑸 𐑑𐑮𐑨𐑯𐑟𐑤𐑦𐑑𐑩𐑮𐑱𐑑𐑦𐑙 𐑦𐑙𐑜𐑤𐑦𐑖 𐑑{" "}
          <a
            href="https://en.wikipedia.org/wiki/Shavian_alphabet"
            target="_blank"
            rel="noopener noreferrer"
          >
            𐑖𐑱𐑝𐑰𐑩𐑯
          </a>
          .
        </p>
        <div className="shavianator-layout">
          <div className="shavianator-input-container">
            <label className="shavianator-label">english</label>
            <div className="shavianator-input-wrapper">
              <textarea
                ref={textareaRef}
                className="shavianator-input shavianator-textarea"
                placeholder="Enter text to shavianate"
                value={text}
                onChange={(e) => setText(e.target.value)}
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
