import React, { useState } from "react";
import { shavianateSentence } from "./shavianating";

import "../styles/shavianator.css";

export default function Shavianator() {
  console.log(shavianateSentence("Hello world"));
  const [sentence, setSentence] = useState("");
  const handleSentenceChange = (e) => {
    setSentence(e.target.value);
  };
  return (
    <div id="app-base" className="shavianator-colors">
      <div className="content-wrapper shavianator-colors">
        <h2 className="title shavianator-colors">shavianator</h2>
        <input
          type="text"
          className="shavianator-input"
          placeholder="Enter a sentence to shavianate"
          value={sentence}
          onChange={handleSentenceChange}
        />
        <p className="shavianator-output">{shavianateSentence(sentence)}</p>
      </div>
    </div>
  );
}
