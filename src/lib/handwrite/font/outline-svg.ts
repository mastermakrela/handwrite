/**
 * Render built glyph outlines straight to an SVG path string — for the in-app
 * comparison view. This bypasses the FontFace preview entirely: it draws the
 * exact outline the builder produced, at any size, updating instantly when a
 * tuning knob changes (so you can actually SEE what each knob does side by side).
 */
import { DEFAULT_METRICS, type GlyphDef, type GlyphOutline } from "../types";

/** One outline (font units, y-up) -> SVG subpath, shifted by dx and flipped to y-down. */
function outlineToSubpath(o: GlyphOutline, dx: number): string {
  let d = "";
  for (const c of o) {
    switch (c.type) {
      case "M":
        d += `M${(c.x + dx).toFixed(1)} ${(-c.y).toFixed(1)} `;
        break;
      case "L":
        d += `L${(c.x + dx).toFixed(1)} ${(-c.y).toFixed(1)} `;
        break;
      case "C":
        d += `C${(c.x1 + dx).toFixed(1)} ${(-c.y1).toFixed(1)} ${(c.x2 + dx).toFixed(1)} ${(-c.y2).toFixed(1)} ${(c.x + dx).toFixed(1)} ${(-c.y).toFixed(1)} `;
        break;
      case "Q":
        d += `Q${(c.x1 + dx).toFixed(1)} ${(-c.y1).toFixed(1)} ${(c.x + dx).toFixed(1)} ${(-c.y).toFixed(1)} `;
        break;
      case "Z":
        d += "Z ";
        break;
    }
  }
  return d;
}

export interface LaidOutText {
  /** combined SVG path data for the whole string (alternates[0] of each glyph). */
  d: string;
  /** ink advance width in font units. */
  width: number;
  /** viewBox top (font units, y-down) — shared baseline across renders. */
  top: number;
  /** viewBox height (font units). */
  height: number;
  /** SVG viewBox covering one em-height line of the laid-out text. */
  viewBox: string;
}

const SPACE_ADVANCE = Math.round(DEFAULT_METRICS.unitsPerEm * 0.3);
const TOP = -(DEFAULT_METRICS.ascender + 40);
const HEIGHT = DEFAULT_METRICS.ascender - DEFAULT_METRICS.descender + 80;

/** Lay out a sample string from built glyphs into one SVG path + viewBox. */
export function layoutGlyphs(glyphs: GlyphDef[], text: string): LaidOutText {
  const map = new Map(glyphs.map((g) => [g.char, g]));
  let x = 0;
  let d = "";
  for (const ch of text) {
    if (ch === " ") {
      x += SPACE_ADVANCE;
      continue;
    }
    const g = map.get(ch);
    if (!g) {
      x += SPACE_ADVANCE;
      continue;
    }
    d += outlineToSubpath(g.alternates[0] ?? [], x);
    x += g.advanceWidth;
  }
  const width = Math.max(x, 1);
  return { d, width, top: TOP, height: HEIGHT, viewBox: `0 ${TOP} ${width} ${HEIGHT}` };
}
