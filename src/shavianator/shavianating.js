// Token types enum
export const TokenType = {
  WORD: "word",
  PUNCTUATION: "punctuation",
  WHITESPACE: "whitespace",
  NEWLINE: "newline",
};

// Global reference to toShavian function, set externally
let toShavian = null;

export const setToShavian = (fn) => {
  toShavian = fn;
};

// Shavian shorthand words (single character representations)
const SHAVIAN_SHORTHAND = {
  "𐑞": "the",
  "𐑝": "of",
  "𐑯": "and",
  "𐑑": "to",
  "𐑩": "a",
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

const ARPABET_TO_SHAVIAN = Object.fromEntries(
  Object.entries(SHAVIAN_TO_ARPABET).map(([shavian, arpabet]) => [
    arpabet,
    shavian,
  ])
);

export const shavianateParagraphs = (paragraphs) =>
  paragraphs.split("\n").map(toShavian).join("\n");

export const getArpabetFromShavian = (word) => {
  const clean = word.replace(/[^\u{10450}-\u{1047F}]/gu, "");
  const chars = [...clean];
  const arpabet = chars.map((c) => SHAVIAN_TO_ARPABET[c] ?? c).join(" ");
  return chars.length === 1 && SHAVIAN_SHORTHAND[clean]
    ? `${arpabet} (${SHAVIAN_SHORTHAND[clean]})`
    : arpabet;
};

// Convert quotes to guillemets - keep other punctuation as-is
const convertQuotesToGuillemets = (text, quoteState) =>
  text.replace(/["\u201C\u201D]/g, () => {
    const g = quoteState.isOpen ? "«" : "»";
    quoteState.isOpen = !quoteState.isOpen;
    return g;
  });

const makeWhitespaceToken = (str) => ({
  type: TokenType.WHITESPACE,
  english: str,
  shavian: str,
  index: null,
});

const makePunctuationToken = (str, quoteState) => ({
  type: TokenType.PUNCTUATION,
  english: str,
  shavian: convertQuotesToGuillemets(str, quoteState),
  index: null,
});

const makeWordToken = (word, wordCount) => ({
  type: TokenType.WORD,
  english: word,
  shavian:
    word.toLowerCase() === "a" ? ARPABET_TO_SHAVIAN["AX"] : toShavian(word),
  index: wordCount,
});

// Helper: Tokenize a single segment, either whitespace, punctuation, or word (with pre/post)
function tokenizeSegment(part, quoteState, wordCountRef) {
  const tokens = [];
  if (/^\s+$/.test(part)) {
    tokens.push(makeWhitespaceToken(part));
    return tokens;
  }
  const match = part.match(/^([^\w]*)(\w[\w'\u2019'-]*\w|\w)?([^\w]*)$/);
  if (!match || !match[2]) {
    tokens.push(makePunctuationToken(part, quoteState));
    return tokens;
  }
  const [, pre, word, post] = match;
  if (pre) tokens.push(makePunctuationToken(pre, quoteState));
  tokens.push(makeWordToken(word, wordCountRef.value++));
  if (post) tokens.push(makePunctuationToken(post, quoteState));
  return tokens;
}

// Tokenize a single line into a flat array of tokens.
const tokenizeLine = (line, quoteState, existingWordCount = 0) => {
  const tokens = [];
  let wordCountRef = { value: existingWordCount };
  // split including whitespace as separate tokens
  for (const part of line.split(/(\s+)/)) {
    if (!part) continue;
    const segTokens = tokenizeSegment(part, quoteState, wordCountRef);
    tokens.push(...segTokens);
  }
  return { tokens, wordCount: wordCountRef.value };
};

export const tokenizeText = (text) => {
  const lines = text.split("\n");
  const quoteState = { isOpen: true };
  let tokens = [];
  let wordCount = 0;
  lines.forEach((line, i) => {
    if (i > 0) {
      tokens.push({
        type: TokenType.NEWLINE,
        english: "\n",
        shavian: "\n",
        index: null,
      });
    }
    const result = tokenizeLine(line, quoteState, wordCount);
    tokens = tokens.concat(result.tokens);
    wordCount = result.wordCount;
  });
  return tokens;
};
