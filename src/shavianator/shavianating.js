const toShavian = require("to-shavian");

// Shavian shorthand words (single character representations)
const SHAVIAN_SHORTHAND = {
  "𐑞": "the",
  "𐑝": "of",
  "𐑯": "and",
  "𐑑": "to",
};

// Shavian to ARPABET mapping
const SHAVIAN_TO_ARPABET = {
  // Shavian-Only Punctuation
  "·": "",
  
  // Consonants
  "𐑐": "P",
  "𐑚": "B",
  "𐑑": "T",
  "𐑛": "D",
  "𐑒": "K",
  "𐑜": "G",
  "𐑓": "F",
  "𐑝": "V",
  "𐑔": "TH",
  "𐑞": "DH",
  "𐑕": "S",
  "𐑟": "Z",
  "𐑖": "SH",
  "𐑠": "ZH",
  "𐑗": "CH",
  "𐑡": "JH",
  "𐑣": "HH",
  "𐑢": "W",
  "𐑘": "Y",
  "𐑮": "R",
  "𐑤": "L",
  "𐑥": "M",
  "𐑯": "N",
  "𐑙": "NG",

  // Vowels
  "𐑰": "IY", // eat
  "𐑦": "IH", // if
  "𐑱": "EY", // age
  "𐑧": "EH", // egg
  "𐑨": "AE", // ash
  "𐑭": "AA", // ah
  "𐑷": "AO", // awe
  "𐑴": "OW", // oak
  "𐑫": "UH", // wool
  "𐑵": "UW", // ooze
  "𐑳": "AH", // up
  "𐑩": "AX", // schwa
  "𐑲": "AY", // ice
  "𐑬": "AW", // out
  "𐑶": "OY", // oil

  // Rhotic Vowels (compound)
  "𐑻": "ER", // err
  "𐑸": "AA+R", // are
  "𐑹": "AO+R", // or
  "𐑺": "EH+R", // air
  "𐑽": "IH+R", // ear
  "𐑼": "AX+R", // schwa + r
  "𐑾": "IY+AX", // IY + schwa
  "𐑿": "Y+UW", // Y + UW
};

export const shavianateParagraphs = (paragraphs) => {
  return paragraphs
    .split("\n")
    .map((sentence) => toShavian(sentence))
    .join("\n");
};

export const getArpabetFromShavian = (word) => {
  // Strip punctuation from the word to check if it's shorthand
  const cleanWord = word.replace(/[^\u{10450}-\u{1047F}]/gu, "");

  // Map each character to ARPABET
  const characters = [...cleanWord];
  const arpabet = characters.map((c) => SHAVIAN_TO_ARPABET[c] ?? c).join(" ");

  // Check if it's a single-character shorthand word and add that info
  if (characters.length === 1 && SHAVIAN_SHORTHAND[cleanWord]) {
    return `${arpabet} (${SHAVIAN_SHORTHAND[cleanWord]})`;
  }

  return arpabet;
};
