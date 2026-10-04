/**
 * Prompt phrases for sentence-capture mode. Kept to ~15 chars so letters stay
 * roomy on a wide iPad canvas without horizontal scrolling. The presets are
 * grouped to cover the charsets in `charsets.ts` (lowercase/uppercase pangrams
 * split into chunks, digits, punctuation, and the German/Polish accents).
 *
 * A prompt's target sequence is its text as tokens, INCLUDING spaces (runs of
 * whitespace collapse to a single space token). Each token gets its own segment;
 * space tokens are expected to be empty and are skipped on Apply, so the natural
 * gap between words has a home instead of throwing off the letter count.
 */
import type { CharDef } from "#lib/handwrite/charsets.js";

export interface Prompt {
  id: string;
  group: string;
  text: string;
  /** target tokens = text chars, with whitespace runs collapsed to one space */
  chars: string[];
}

/** Tokens a prompt expects: each char, with whitespace runs collapsed to a single space. */
export function promptChars(text: string): string[] {
  return [...text.trim().replace(/\s+/g, " ")];
}

/**
 * Lay the active character set out into the rows of tokens used by multiline
 * capture — one short line per `string[]`. Glyphs are grouped into runs of
 * `groupEvery` separated by a space token (a comfortable pen-lift gap that also
 * gives the divider proposer a word-boundary anchor), and a row holds up to
 * `perLine` glyphs (spaces don't count toward the glyph budget). This is what
 * generates the "full set" default paragraph from the enabled groups.
 */
export function coverageRows(chars: CharDef[], perLine = 15, groupEvery = 5): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let inRow = 0; // glyphs placed in the current row
  for (const def of chars) {
    if (inRow > 0 && inRow % groupEvery === 0) row.push(" ");
    row.push(def.char);
    inRow++;
    if (inRow >= perLine) {
      rows.push(row);
      row = [];
      inRow = 0;
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

const p = (id: string, group: string, text: string): Prompt => ({
  id,
  group,
  text,
  chars: promptChars(text),
});

export const PROMPTS: Prompt[] = [
  // full pangram (default phrase) — the round model writes this whole line each round
  p("pangram", "lower", "the quick brown fox jumps over the lazy dog"),
  // lowercase pangram, split — together covers a–z
  p("lower-1", "lower", "the quick brown"),
  p("lower-2", "lower", "fox jumps over"),
  p("lower-3", "lower", "the lazy dog"),
  // uppercase pangram, split — together covers A–Z
  p("upper-1", "upper", "THE QUICK BROWN"),
  p("upper-2", "upper", "FOX JUMPS OVER"),
  p("upper-3", "upper", "THE LAZY DOG"),
  // digits & punctuation
  p("digits", "digits", "0123456789"),
  p("punct", "punct", ". , ! ? ' \" - : ; ( )"),
  // German accents
  p("german-1", "german", "schöne grüße"),
  p("german-2", "german", "weiß"),
  // Polish pangram — covers all 9 Polish accents
  p("polish-1", "polish", "zażółć gęślą"),
  p("polish-2", "polish", "jaźń"),
];
