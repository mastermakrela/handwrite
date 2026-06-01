/**
 * Character sets to capture — base Latin plus German and Polish diacritics.
 * Each glyph carries its Unicode codepoint and a PostScript-safe glyph name
 * (font tables need valid names, especially for accented letters).
 */
export interface CharDef {
  char: string;
  codepoint: number;
  name: string;
}
export interface CharGroup {
  id: string;
  label: string;
  /** included by default? */
  on: boolean;
  chars: CharDef[];
}

const PUNCT_NAMES: Record<string, string> = {
  ".": "period",
  ",": "comma",
  "!": "exclam",
  "?": "question",
  "'": "quotesingle",
  '"': "quotedbl",
  "-": "hyphen",
  ":": "colon",
  ";": "semicolon",
  "(": "parenleft",
  ")": "parenright",
  "@": "at",
  "/": "slash",
  "&": "ampersand",
  "#": "numbersign",
  "%": "percent",
};
const DIGIT_NAMES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

const c = (char: string, name?: string): CharDef => ({
  char,
  codepoint: char.codePointAt(0)!,
  name: name ?? defaultName(char),
});
function defaultName(ch: string): string {
  if (/[a-zA-Z]/.test(ch)) return ch;
  if (/[0-9]/.test(ch)) return DIGIT_NAMES[Number(ch)];
  return PUNCT_NAMES[ch] ?? "u" + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
}

export const CHAR_GROUPS: CharGroup[] = [
  {
    id: "lower",
    label: "a – z",
    on: true,
    chars: [..."abcdefghijklmnopqrstuvwxyz"].map((x) => c(x)),
  },
  {
    id: "upper",
    label: "A – Z",
    on: true,
    chars: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((x) => c(x)),
  },
  { id: "digits", label: "0 – 9", on: true, chars: [..."0123456789"].map((x) => c(x)) },
  {
    id: "punct",
    label: "punctuation",
    on: true,
    chars: [".", ",", "!", "?", "'", '"', "-", ":", ";", "(", ")"].map((x) => c(x)),
  },
  {
    id: "german",
    label: "German",
    on: false,
    chars: [
      c("ä", "adieresis"),
      c("ö", "odieresis"),
      c("ü", "udieresis"),
      c("Ä", "Adieresis"),
      c("Ö", "Odieresis"),
      c("Ü", "Udieresis"),
      c("ß", "germandbls"),
    ],
  },
  {
    id: "polish",
    label: "Polish",
    on: false,
    chars: [
      c("ą", "aogonek"),
      c("ć", "cacute"),
      c("ę", "eogonek"),
      c("ł", "lslash"),
      c("ń", "nacute"),
      c("ó", "oacute"),
      c("ś", "sacute"),
      c("ź", "zacute"),
      c("ż", "zdotaccent"),
      c("Ą", "Aogonek"),
      c("Ć", "Cacute"),
      c("Ę", "Eogonek"),
      c("Ł", "Lslash"),
      c("Ń", "Nacute"),
      c("Ó", "Oacute"),
      c("Ś", "Sacute"),
      c("Ź", "Zacute"),
      c("Ż", "Zdotaccent"),
    ],
  },
];

/** All chars from the given enabled group ids, in order. */
export function activeChars(enabled: Set<string>): CharDef[] {
  return CHAR_GROUPS.filter((g) => enabled.has(g.id)).flatMap((g) => g.chars);
}
