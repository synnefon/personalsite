import { dictionary as CMU_DICTIONARY } from "cmu-pronouncing-dictionary";

// These words are conventionally spelled with one letter in Shavian: https://www.shavian.info/spelling/
const DEFAULT_WORD_OVERRIDES = {
  the: "𐑞",
  of: "𐑝",
  and: "𐑯",
  to: "𐑑",
};

const APRABET_TO_SHAVIAN = {
  AA: "𐑪",
  AE: "𐑨",
  AH: "𐑳",
  AO: "𐑷",
  AW: "𐑬",
  AY: "𐑲",
  B: "𐑚",
  CH: "𐑗",
  D: "𐑛",
  DH: "𐑞",
  EH: "𐑧",
  ER: "𐑻",
  EY: "𐑱",
  F: "𐑓",
  G: "𐑜",
  HH: "𐑣",
  IH: "𐑦",
  IY: "𐑰",
  JH: "𐑡",
  K: "𐑒",
  L: "𐑤",
  M: "𐑥",
  N: "𐑯",
  NG: "𐑙",
  OW: "𐑴",
  OY: "𐑶",
  P: "𐑐",
  R: "𐑮",
  S: "𐑕",
  SH: "𐑖",
  T: "𐑑",
  TH: "𐑔",
  UH: "𐑫",
  UW: "𐑵",
  V: "𐑝",
  W: "𐑢",
  Y: "𐑘",
  Z: "𐑟",
  ZH: "𐑠",
};

// Not including 𐑻 because it matches directly with ER in the arpabet
const SHAVIAN_COMPOUND_LETTERS = {
  𐑰𐑮: "𐑽",
  𐑳𐑮: "𐑼",
  𐑧𐑮: "𐑺",
  𐑰𐑳: "𐑾",
  𐑘𐑵: "𐑿",
  𐑪𐑮: "𐑸",
  𐑷𐑮: "𐑹",
};

function splitOnSpace(text) {
  return text.replace(/\s+/g, " ").trim().split(" ");
}

function getArpabetLetters(arpabetSpelling) {
  const lettersWithSymbols = splitOnSpace(arpabetSpelling);
  const lettersWithoutSymbols = [];
  lettersWithSymbols.forEach((letter) => {
    // Remove stress & auxilory symbols: https://en.wikipedia.org/wiki/ARPABET
    lettersWithoutSymbols.push(/([A-Z]+)/.exec(letter)[0]);
  });
  return lettersWithoutSymbols;
}

const shavianateWord = (word) => {
  if (!CMU_DICTIONARY[word]) {
    return "???";
  }
  if (DEFAULT_WORD_OVERRIDES[word]) {
    return DEFAULT_WORD_OVERRIDES[word];
  }

  let letters = getArpabetLetters(CMU_DICTIONARY[word]).map(
    (phoneme) => APRABET_TO_SHAVIAN[phoneme]
  );

  for (let i = 0; i < letters.length - 1; ) {
    const pair = letters[i] + letters[i + 1];
    const compound = SHAVIAN_COMPOUND_LETTERS[pair];
    if (compound) {
      letters.splice(i, 2, compound);
    } else {
      i++;
    }
  }

  return letters.join("");
};

export const shavianateSentence = (sentence) => {
  const words = splitOnSpace(sentence)
    .map((word) => word.toLowerCase())
    .map((word) => shavianateWord(word));

  return words.join(" ");
};
