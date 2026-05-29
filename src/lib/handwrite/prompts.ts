/**
 * Short prompt phrases for sentence-capture mode. Each is kept ≤ ~18 chars so
 * letters stay roomy on an iPad without horizontal scrolling. The presets are
 * grouped to cover the charsets in `charsets.ts` (lowercase/uppercase pangrams
 * split into chunks, digits, punctuation, and the German/Polish accents).
 *
 * A prompt's target sequence is simply its text with spaces removed — that's the
 * list of characters the user is expected to write, one per segment.
 */
export interface Prompt {
  id: string;
  group: string;
  text: string;
  /** target characters = text with whitespace removed */
  chars: string[];
}

/** Characters a prompt expects: its visible text minus any whitespace. */
export function promptChars(text: string): string[] {
  return [...text].filter((ch) => !/\s/.test(ch));
}

const p = (id: string, group: string, text: string): Prompt => ({ id, group, text, chars: promptChars(text) });

export const PROMPTS: Prompt[] = [
  // lowercase pangram, split — together covers a–z
  p("lower-1", "lower", "the quick"),
  p("lower-2", "lower", "brown fox"),
  p("lower-3", "lower", "jumps over"),
  p("lower-4", "lower", "the lazy dog"),
  // uppercase pangram, split — together covers A–Z
  p("upper-1", "upper", "THE QUICK"),
  p("upper-2", "upper", "BROWN FOX"),
  p("upper-3", "upper", "JUMPS OVER"),
  p("upper-4", "upper", "THE LAZY DOG"),
  // digits & punctuation
  p("digits", "digits", "0123456789"),
  p("punct", "punct", ". , ! ? ' \" - : ; ( )"),
  // German accents
  p("german-1", "german", "schöne grüße"),
  p("german-2", "german", "weiß"),
  // Polish pangram — covers all 9 Polish accents
  p("polish-1", "polish", "zażółć"),
  p("polish-2", "polish", "gęślą jaźń"),
];
