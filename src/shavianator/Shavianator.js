import React, { useState } from "react";
import { shavianateSentence } from "./shavianating";

import "../styles/shavianator.css";

export default function Shavianator() {
  console.log(shavianateSentence("Hello world"));
  const [sentence, setSentence] = useState("");
  const handleSentenceChange = (e) => {
    setSentence(e.target.value);
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
          {words.map((word, index) => (
            <span key={index}>{word.text}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
