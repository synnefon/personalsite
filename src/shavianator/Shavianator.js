import React, { useState } from "react";
import { shavianateSentence } from "./shavianating";

export default function Shavianator() {
  console.log(shavianateSentence("Hello world"));
  const [sentence, setSentence] = useState("");
  const handleSentenceChange = (e) => {
    setSentence(e.target.value);
  };
  return (
    <div id="app-base">
      <div className="content-wrapper">
        <h2 className="title">shavianator</h2>
        <input
          type="text"
          placeholder="Enter a sentence to shavianate"
          value={sentence}
          onChange={handleSentenceChange}
        />
        <p>{shavianateSentence(sentence)}</p>
      </div>
    </div>
  );
}
