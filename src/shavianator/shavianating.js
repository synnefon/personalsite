import { CONTRACTIONS } from "./contractions";

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

export const getArpabetFromShavian = (word) => {
  const clean = word.replace(/[^\u{10450}-\u{1047F}]/gu, "");
  const chars = [...clean];
  const arpabet = chars.map((c) => SHAVIAN_TO_ARPABET[c] ?? c).join(" ");
  return chars.length === 1 && SHAVIAN_SHORTHAND[clean]
    ? `${arpabet} (${SHAVIAN_SHORTHAND[clean]})`
    : arpabet;
};

const normalizeApostrophes = (str) => str.replace(/’/g, "'");

const hasShavian = (str) => /[\u{10450}-\u{1047F}]/u.test(str);

const arpabetToShavian = (phonemes) =>
  phonemes
    .split(" ")
    .map((p) => ARPABET_TO_SHAVIAN[p] ?? p)
    .join("");

const toShavianLetters = (str) => [...str].filter((c) => hasShavian(c));

const SIBILANT_FINALS = new Set(
  ["S", "Z", "SH", "ZH", "CH", "JH"].map((p) => ARPABET_TO_SHAVIAN[p])
);
const VOICELESS_FINALS = new Set(
  ["P", "T", "K", "F", "TH"].map((p) => ARPABET_TO_SHAVIAN[p])
);
const VOWEL_LETTERS = new Set([..."𐑰𐑦𐑱𐑧𐑨𐑭𐑷𐑴𐑫𐑵𐑳𐑩𐑲𐑬𐑶𐑻𐑸𐑹𐑺𐑽𐑼𐑾𐑿"]);

const lastLetter = (shavian) => {
  const letters = toShavianLetters(shavian);
  return letters[letters.length - 1];
};

// 's is voiced, voiceless, or syllabic depending on the preceding sound
const possessiveS = (base) => {
  const last = lastLetter(base);
  if (SIBILANT_FINALS.has(last)) return "𐑦𐑟";
  if (VOICELESS_FINALS.has(last)) return "𐑕";
  return "𐑟";
};

// Clitic endings for apostrophe words outside the contraction list.
// The bare apostrophe covers plural possessives (dogs', James').
const APOSTROPHE_SUFFIXES = [
  { ending: "n't", append: () => "𐑯𐑑" },
  { ending: "'s", append: possessiveS },
  { ending: "'", append: () => "" },
  { ending: "'ll", append: () => "𐑤" },
  { ending: "'re", append: () => "𐑼" },
  { ending: "'ve", append: (base) => (VOWEL_LETTERS.has(lastLetter(base)) ? "𐑝" : "𐑩𐑝") },
  { ending: "'d", append: () => "𐑛" },
  { ending: "'m", append: () => "𐑥" },
];

const shavianateSuffixed = (word) => {
  const normalized = normalizeApostrophes(word.toLowerCase());
  for (const { ending, append } of APOSTROPHE_SUFFIXES) {
    if (!normalized.endsWith(ending)) continue;
    const base = toShavian(word.slice(0, word.length - ending.length));
    if (hasShavian(base)) return base + append(base);
  }
  return null;
};

const shavianateWord = (word) => {
  if (word.toLowerCase() === "a") return ARPABET_TO_SHAVIAN["AX"];
  const key = normalizeApostrophes(word.toLowerCase());
  if (CONTRACTIONS[key]) return arpabetToShavian(CONTRACTIONS[key]);
  if (key.includes("'")) return shavianateSuffixed(word) ?? word;
  return toShavian(word);
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
  shavian: shavianateWord(word),
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
  let [, pre, word, post] = match;
  // a leading apostrophe belongs to contractions like 'tis / 'em
  const lead = pre.match(/['\u2019]$/);
  if (lead && CONTRACTIONS[normalizeApostrophes((lead[0] + word).toLowerCase())]) {
    pre = pre.slice(0, -1);
    word = lead[0] + word;
  }
  // a trailing apostrophe after s is a plural possessive (dogs', James'),
  // unless paired with an opening quote ('dogs')
  if (
    /^['\u2019]/.test(post) &&
    /s$/i.test(word) &&
    !/['\u2019]$/.test(pre) &&
    !/^['\u2019]/.test(word)
  ) {
    word += post[0];
    post = post.slice(1);
  }
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
