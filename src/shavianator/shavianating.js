const toShavian = require("to-shavian");

// Token types enum
export const TokenType = {
  WORD: "word",
  PUNCTUATION: "punctuation",
  WHITESPACE: "whitespace",
  NEWLINE: "newline",
};

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

export const shavianateParagraphs = paragraphs =>
  paragraphs.split("\n").map(toShavian).join("\n");

export const getArpabetFromShavian = word => {
  const clean = word.replace(/[^\u{10450}-\u{1047F}]/gu, "");
  const chars = [...clean];
  const arpabet = chars.map(c => SHAVIAN_TO_ARPABET[c] ?? c).join(" ");
  return (chars.length === 1 && SHAVIAN_SHORTHAND[clean])
    ? `${arpabet} (${SHAVIAN_SHORTHAND[clean]})`
    : arpabet;
};

const convertQuotesToGuillemets = (text, quoteState) =>
  text.replace(/["\u201C\u201D]/g, () => {
    const g = quoteState.isOpen ? "«" : "»";
    quoteState.isOpen = !quoteState.isOpen;
    return g;
  });

const tokenizeLine = (line, tokens, quoteState) => {
  line.split(/(\s+)/).forEach(part => {
    if (!part) return;
    if (/^\s+$/.test(part)) {
      tokens.push({ type: TokenType.WHITESPACE, english: part, shavian: part, index: null });
      return;
    }
    const m = part.match(/^([^\w]*)(\w[\w'\u2019'-]*\w|\w)([^\w]*)$/);
    if (!m) {
      tokens.push({
        type: TokenType.PUNCTUATION,
        english: part,
        shavian: convertQuotesToGuillemets(toShavian(part), quoteState),
        index: null,
      });
      return;
    }
    const [, pre, word, post] = m;
    if (pre) tokens.push({
      type: TokenType.PUNCTUATION,
      english: pre,
      shavian: convertQuotesToGuillemets(toShavian(pre), quoteState),
      index: null,
    });
    const wordIndex = tokens.filter(t => t.type === TokenType.WORD).length;
    tokens.push({
      type: TokenType.WORD,
      english: word,
      shavian: toShavian(word),
      index: wordIndex,
    });
    if (post) tokens.push({
      type: TokenType.PUNCTUATION,
      english: post,
      shavian: convertQuotesToGuillemets(toShavian(post), quoteState),
      index: null,
    });
  });
};

export const tokenizeText = text => {
  const tokens = [];
  const lines = text.split("\n");
  const quoteState = { isOpen: true };
  lines.forEach((line, i) => {
    if (i > 0) tokens.push({
      type: TokenType.NEWLINE, english: "\n", shavian: "\n", index: null
    });
    tokenizeLine(line, tokens, quoteState);
  });
  return tokens;
};
