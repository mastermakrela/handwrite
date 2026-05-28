/**
 * handwrite — shared glyph/font data model.
 *
 * The whole point of this file: BOTH ingestion modes (photo-of-paper and
 * iPad/Apple-Pencil direct-draw) normalize their output into the SAME
 * `GlyphOutline` shape, so the font-assembly backend never has to care where
 * the strokes came from.
 *
 * Coordinate convention for everything in font-space:
 *   - origin (0,0) sits on the BASELINE at the left side-bearing edge
 *   - +y points UP (font convention — opposite of screen/canvas y-down)
 *   - units are font units within `unitsPerEm` (1000 for the CFF/OTF path)
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** A single drawing command. Mirrors SVG / opentype.js path ops. */
export type PathCommand =
  | { type: "M"; x: number; y: number }
  | { type: "L"; x: number; y: number }
  | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number } // cubic
  | { type: "Q"; x1: number; y1: number; x: number; y: number } // quadratic
  | { type: "Z" };

/**
 * One glyph's outline: a flat list of commands describing one or more closed
 * contours (each contour = M ... Z). Counters/holes are expressed as separate
 * contours with opposite winding (filled correctly by the non-zero rule).
 */
export type GlyphOutline = PathCommand[];

/** A single captured rendition of a character (one of possibly several). */
export interface GlyphSample {
  char: string;
  codepoint: number;
  outline: GlyphOutline;
  advanceWidth: number;
  source: "draw" | "photo";
}

/**
 * A character in the font, with one OR MORE alternate outlines.
 * Multiple alternates drive the natural "every letter looks different"
 * variation via a `calt` cycling feature (authored by the fontTools step).
 */
export interface GlyphDef {
  char: string;
  /** Unicode codepoint. */
  codepoint: number;
  /** PostScript-safe glyph name, e.g. "a", "A", "space", "one". */
  name: string;
  advanceWidth: number;
  /** alternates[0] is the default/primary outline. */
  alternates: GlyphOutline[];
}

export interface FontSpec {
  familyName: string;
  styleName: string;
  /** 1000 for CFF/OTF (cubic). 2048 for true TrueType/glyf if you go that route. */
  unitsPerEm: number;
  ascender: number;
  descender: number; // negative
  capHeight?: number;
  xHeight?: number;
  glyphs: GlyphDef[];
}

/** Sensible defaults for a Latin handwriting font in a 1000-unit em. */
export const DEFAULT_METRICS = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  capHeight: 700,
  xHeight: 500,
  baseline: 0,
} as const;
