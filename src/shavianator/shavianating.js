import { dictionary as CMU_DICTIONARY } from "cmu-pronouncing-dictionary";

const DEFAULT_WORD_OVERRIDES = {
  the: "𐑞",
  of: "𐑝",
  and: "𐑯",
  to: "𐑑",
  a: "𐑩",
};

// https://www.shavian.info/alphabet/
const APRABET_TO_SHAVIAN = {
  // Consonants
  P: "𐑐",
  B: "𐑚",
  T: "𐑑",
  D: "𐑛",
  K: "𐑒",
  G: "𐑜",
  F: "𐑓",
  V: "𐑝",
  TH: "𐑔",
  DH: "𐑞",
  S: "𐑕",
  Z: "𐑟",
  SH: "𐑖",
  ZH: "𐑠",
  CH: "𐑗",
  JH: "𐑡",
  HH: "𐑣",
  W: "𐑢",
  Y: "𐑘",
  R: "𐑮",
  L: "𐑤",
  M: "𐑥",
  N: "𐑯",
  NG: "𐑙",

  // Vowels
  IY: "𐑰", // eat
  IH: "𐑦", // if
  EY: "𐑱", // age
  EH: "𐑧", // egg
  AE: "𐑨", // ash
  AA: "𐑭", // ah
  AO: "𐑷", // awe
  OW: "𐑴", // oak
  UH: "𐑫", // wool
  UW: "𐑵", // ooze
  AH: "𐑳", // up
  AX: "𐑩", // schwa
  AY: "𐑲", // ice
  AW: "𐑬", // out
  OY: "𐑶", // oil

  // Rhotic Vowels
  ER: "𐑻", // err
  AA: "𐑸", // are
  AO: "𐑹", // or
  EH: "𐑺", // air
  IH: "𐑽", // ear (weak vowel + r)
  IY: "𐑽", // ear (eat+r)
};

const SHAVIAN_COMPOUND_LETTERS = {
  "𐑰𐑮": "𐑽", // IY + R
  "𐑳𐑮": "𐑼", // AX/AH + R
  "𐑧𐑮": "𐑺", // EH + R
  "𐑰𐑳": "𐑾", // IY + AX
  "𐑘𐑵": "𐑿", // Y + UW
  "𐑪𐑮": "𐑸", // AA + R
  "𐑷𐑮": "𐑹", // AO + R
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
      chars: [{ char: word, arpabet: "UNRECOGNIZED" }],
      recognized: false,
    };
  }

  if (DEFAULT_WORD_OVERRIDES[cleanWord]) {
    return {
      chars: [
        {
          char: DEFAULT_WORD_OVERRIDES[cleanWord],
          arpabet: `_${cleanWord}_`,
        },
      ],
      recognized: true,
    };
  }

  const phonemes = getArpabetLetters(CMU_DICTIONARY[cleanWord]);
  let chars = phonemes.map((phoneme) => ({
    char: APRABET_TO_SHAVIAN[phoneme],
    arpabet: phoneme,
  }));

  // Combine compound letters
  for (let i = 0; i < chars.length - 1; ) {
    const pair = chars[i].char + chars[i + 1].char;
    const compound = SHAVIAN_COMPOUND_LETTERS[pair];
    if (compound) {
      chars.splice(i, 2, {
        char: compound,
        arpabet: `${chars[i].arpabet}+${chars[i + 1].arpabet}`,
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
      return {
        chars: [{ char: token, arpabet: null }],
        recognized: true,
        isWhitespace: true,
      };

    // Handle hyphenated words by splitting on hyphens
    const hyphenMatch = token.match(/^([^\w]*)(.+?)([^\w]*)$/);
    if (!hyphenMatch)
      return {
        chars: [{ char: token, arpabet: null }],
        recognized: true,
        isPunctuation: true,
      };

    const [, lead, middle, trail] = hyphenMatch;

    // Preserve acronyms and all-caps words (2+ chars)
    if (/^[A-Z0-9]{2,}$/.test(middle)) {
      return {
        chars: [{ char: token, arpabet: null }],
        recognized: true,
      };
    }

    // Check if middle part contains hyphens between words
    if (/-/.test(middle) && /\w/.test(middle)) {
      const parts = middle.split(/(-)/); // Split and keep hyphens
      const allChars = [];

      if (lead) allChars.push({ char: lead, arpabet: null });

      parts.forEach((part) => {
        if (part === '-') {
          allChars.push({ char: '-', arpabet: null });
        } else if (/\w+/.test(part)) {
          const { chars } = shavianateWord(part);
          allChars.push(...chars);
        } else if (part) {
          allChars.push({ char: part, arpabet: null });
        }
      });

      if (trail) allChars.push({ char: trail, arpabet: null });

      return { chars: allChars, recognized: true };
    }

    // No hyphens in middle, process normally
    const match = token.match(/^([^\w]*)(\w+)([^\w]*)$/);
    if (!match)
      return {
        chars: [{ char: token, arpabet: null }],
        recognized: true,
        isPunctuation: true,
      };

    const [, matchLead, word, matchTrail] = match;
    const { chars, recognized } = shavianateWord(word);

    const allChars = [];
    if (matchLead) allChars.push({ char: matchLead, arpabet: null });
    allChars.push(...chars);
    if (matchTrail) allChars.push({ char: matchTrail, arpabet: null });

    return { chars: allChars, recognized };
  });
};
