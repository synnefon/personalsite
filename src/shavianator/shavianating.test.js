import toShavian from "to-shavian";
import { CONTRACTIONS } from "./contractions";
import {
  getArpabetFromShavian,
  setToShavian,
  tokenizeText,
  TokenType,
} from "./shavianating";

beforeAll(() => setToShavian(toShavian));

const shav = (text) =>
  tokenizeText(text)
    .map((t) => t.shavian)
    .join("");

const SHAVIAN_ONLY = /^[\u{10450}-\u{1047F}]+$/u;

test("every listed contraction transliterates to pure shavian", () => {
  for (const english of Object.keys(CONTRACTIONS)) {
    expect(shav(english)).toMatch(SHAVIAN_ONLY);
  }
});

test.each([
  ["don't", "𐑛𐑴𐑯𐑑"],
  ["can't", "𐑒𐑨𐑯𐑑"],
  ["won't", "𐑢𐑴𐑯𐑑"],
  ["I'm", "𐑲𐑥"],
  ["it's", "𐑦𐑑𐑕"],
  ["you're", "𐑿𐑼"],
  ["we're", "𐑢𐑽"],
  ["they're", "𐑞𐑺"],
  ["could've", "𐑒𐑫𐑛𐑩𐑝"],
  ["shouldn't've", "𐑖𐑫𐑛𐑩𐑯𐑑𐑩𐑝"],
  ["o'clock", "𐑩𐑒𐑤𐑭𐑒"],
  ["y'all", "𐑘𐑷𐑤"],
  ["ma'am", "𐑥𐑨𐑥"],
  ["let's", "𐑤𐑧𐑑𐑕"],
  ["'tis", "𐑑𐑦𐑟"],
  ["'em", "𐑩𐑥"],
])("%s -> %s", (english, expected) => {
  expect(shav(english)).toBe(expected);
});

test("contractions are case-insensitive and accept curly apostrophes", () => {
  expect(shav("Don't")).toBe("𐑛𐑴𐑯𐑑");
  expect(shav("don’t")).toBe("𐑛𐑴𐑯𐑑");
  expect(shav("IT’S")).toBe("𐑦𐑑𐑕");
});

test.each([
  ["Dan's", "·𐑛𐑨𐑯𐑟"],
  ["James'", "·𐑡𐑱𐑥𐑟"],
  ["James's", "·𐑡𐑱𐑥𐑟𐑦𐑟"],
  ["James’", "·𐑡𐑱𐑥𐑟"],
  ["cat's", "𐑒𐑨𐑑𐑕"],
  ["dog's", "𐑛𐑭𐑜𐑟"],
  ["boss's", "𐑚𐑭𐑕𐑦𐑟"],
  ["dogs'", "𐑛𐑭𐑜𐑟"],
  ["month's", "𐑥𐑩𐑯𐑔𐑕"],
])("possessive %s -> %s", (english, expected) => {
  expect(shav(english)).toBe(expected);
});

test("leading-apostrophe contractions absorb the apostrophe as one word token", () => {
  const tokens = tokenizeText("'tis");
  expect(tokens).toHaveLength(1);
  expect(tokens[0].type).toBe(TokenType.WORD);
  expect(tokens[0].english).toBe("'tis");
});

test("single-quoted words keep their quotes", () => {
  expect(shav("'cat'")).toBe("'𐑒𐑨𐑑'");
  expect(shav("'dogs'")).toBe("'𐑛𐑭𐑜𐑟'");
});

test("tokenization reconstructs the original english exactly", () => {
  const input =
    "Dan's dog can't fetch 'em — 'tis the dogs' day, isn't it? \"Don't!\" she said.";
  const english = tokenizeText(input)
    .map((t) => t.english)
    .join("");
  expect(english).toBe(input);
});

test("contraction output round-trips through the arpabet tooltip", () => {
  expect(getArpabetFromShavian(shav("don't"))).toBe("D OW N T");
  expect(getArpabetFromShavian(shav("you're"))).toBe("Y+UW AX+R");
});

test("apostrophe words with unknown bases fall through unchanged", () => {
  expect(shav("zzxqq's")).toBe("zzxqq's");
});
