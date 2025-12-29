import { dictionary as CMU_DICTIONARY } from "cmu-pronouncing-dictionary";

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
  const cleanWord = word.toLowerCase();

  if (!CMU_DICTIONARY[cleanWord]) {
    return {
      chars: [{ char: "_", arpabet: null }],
      recognized: false
    };
  }

  if (DEFAULT_WORD_OVERRIDES[cleanWord]) {
    return {
      chars: [{
        char: DEFAULT_WORD_OVERRIDES[cleanWord],
        arpabet: `_${cleanWord}_`
      }],
      recognized: true
    };
  }

  const phonemes = getArpabetLetters(CMU_DICTIONARY[cleanWord]);
  let chars = phonemes.map((phoneme) => ({
    char: APRABET_TO_SHAVIAN[phoneme],
    arpabet: phoneme
  }));

  // Combine compound letters
  for (let i = 0; i < chars.length - 1; ) {
    const pair = chars[i].char + chars[i + 1].char;
    const compound = SHAVIAN_COMPOUND_LETTERS[pair];
    if (compound) {
      chars.splice(i, 2, {
        char: compound,
        arpabet: `${chars[i].arpabet}+${chars[i + 1].arpabet}`
      });
    } else {
      i++;
    }
  }

  return { chars, recognized: true };
};

export const shavianateSentence = (sentence) => {
  const tokens = sentence.split(/(\s+)/).filter((token) => token.length > 0);

  return tokens.map((token) => {
    if (/^\s+$/.test(token))
      return { chars: [{ char: token, arpabet: null }], recognized: true, isWhitespace: true };

    const match = token.match(/^([^\w]*)(\w+)([^\w]*)$/);
    if (!match)
      return { chars: [{ char: token, arpabet: null }], recognized: true, isPunctuation: true };

    const [, lead, word, trail] = match;
    const { chars, recognized } = shavianateWord(word);

    const allChars = [];
    if (lead) allChars.push({ char: lead, arpabet: null });
    allChars.push(...chars);
    if (trail) allChars.push({ char: trail, arpabet: null });

    return { chars: allChars, recognized };
  });
};
