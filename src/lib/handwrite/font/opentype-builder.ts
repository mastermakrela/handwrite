/**
 * Font-assembly backend (browser-friendly, pure JS).
 *
 * Takes a `FontSpec` of normalized outlines and produces a real, downloadable
 * OpenType font using opentype.js 2.0.0.
 *
 * IMPORTANT (verified from opentype.js source, issue #594): opentype.js ALWAYS
 * writes CFF (cubic) outlines, i.e. a `.otf`. There is no glyf/TrueType writer.
 * A CFF `.otf` is a fully valid OpenType font and renders identically to `.ttf`
 * everywhere modern (browsers, VS Code, messaging, macOS/Windows). If you need a
 * literal glyf `.ttf` or a `calt` variation feature, that is the Python/fontTools
 * step — see proofs/03-calt-variation.py and docs/ARCHITECTURE.md.
 */

import opentype from "opentype.js";
import type { FontSpec, GlyphDef, GlyphOutline } from "../types";

/** Convert our normalized outline (font units, y-up) into an opentype.js Path. */
export function outlineToPath(outline: GlyphOutline): opentype.Path {
  const path = new opentype.Path();
  for (const cmd of outline) {
    switch (cmd.type) {
      case "M":
        path.moveTo(cmd.x, cmd.y);
        break;
      case "L":
        path.lineTo(cmd.x, cmd.y);
        break;
      case "C":
        path.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        break;
      case "Q":
        path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
        break;
      case "Z":
        path.close();
        break;
    }
  }
  return path;
}

function makeGlyph(def: GlyphDef): opentype.Glyph {
  // Prototype uses the primary alternate. (calt cycling over all alternates is
  // added later by the fontTools step.)
  const path = outlineToPath(def.alternates[0] ?? []);
  return new opentype.Glyph({
    name: def.name,
    unicode: def.codepoint,
    advanceWidth: def.advanceWidth,
    path,
  });
}

/**
 * Build an opentype.js Font from a FontSpec.
 * Always prepends the required `.notdef` glyph and ensures a `space` glyph.
 */
export function buildFont(spec: FontSpec): opentype.Font {
  const notdef = new opentype.Glyph({
    name: ".notdef",
    unicode: 0,
    advanceWidth: Math.round(spec.unitsPerEm * 0.5),
    path: new opentype.Path(),
  });

  const glyphs: opentype.Glyph[] = [notdef];

  const hasSpace = spec.glyphs.some((g) => g.codepoint === 0x20);
  if (!hasSpace) {
    glyphs.push(
      new opentype.Glyph({
        name: "space",
        unicode: 0x20,
        advanceWidth: Math.round(spec.unitsPerEm * 0.3),
        path: new opentype.Path(),
      }),
    );
  }

  for (const def of spec.glyphs) glyphs.push(makeGlyph(def));

  return new opentype.Font({
    familyName: spec.familyName,
    styleName: spec.styleName,
    unitsPerEm: spec.unitsPerEm,
    ascender: spec.ascender,
    descender: spec.descender,
    glyphs,
  });
}

/** Serialize a built font to bytes (works in Node/bun and the browser). */
export function fontToUint8Array(font: opentype.Font): Uint8Array {
  return new Uint8Array(font.toArrayBuffer());
}
