/**
 * PROOF A — "Can we emit a valid, usable font from outlines, entirely in JS?"
 *
 * Builds a small font (H I L O T + space) from hand-authored outlines using the
 * project's opentype.js builder, writes proofs/out/proof-a.otf, and round-trips
 * it back through opentype.parse() to confirm it is structurally valid.
 *
 * Independent validation (does it satisfy a *different* implementation?) is done
 * by proofs/validate.py via fontTools — run `bun run proof:font` then the python
 * validator, or just `bun run proof:all`.
 *
 * Demonstrates: straight contours, cubic Bezier curves, counters/holes (the "O"),
 * multiple glyphs, Unicode cmap, and per-glyph advance widths.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { buildFont, fontToUint8Array } from "../src/lib/handwrite/font/opentype-builder.ts";
import { DEFAULT_METRICS, type GlyphDef, type GlyphOutline } from "../src/lib/handwrite/types.ts";

const K = 0.5522847498307936; // cubic-bezier circle constant

/** Axis-aligned rectangle as one closed contour (font units, y-up). */
function rect(x0: number, y0: number, x1: number, y1: number): GlyphOutline {
  return [
    { type: "M", x: x0, y: y1 },
    { type: "L", x: x1, y: y1 },
    { type: "L", x: x1, y: y0 },
    { type: "L", x: x0, y: y0 },
    { type: "Z" },
  ];
}

/** Ellipse via 4 cubic Beziers. `cw` controls winding (holes use the opposite). */
function ellipse(cx: number, cy: number, rx: number, ry: number, cw: boolean): GlyphOutline {
  const ox = rx * K;
  const oy = ry * K;
  // Counter-clockwise reference, reversed when cw === true.
  const p: GlyphOutline = [
    { type: "M", x: cx + rx, y: cy },
    { type: "C", x1: cx + rx, y1: cy + oy, x2: cx + ox, y2: cy + ry, x: cx, y: cy + ry },
    { type: "C", x1: cx - ox, y1: cy + ry, x2: cx - rx, y2: cy + oy, x: cx - rx, y: cy },
    { type: "C", x1: cx - rx, y1: cy - oy, x2: cx - ox, y2: cy - ry, x: cx, y: cy - ry },
    { type: "C", x1: cx + ox, y1: cy - ry, x2: cx + rx, y2: cy - oy, x: cx + rx, y: cy },
    { type: "Z" },
  ];
  return cw ? p : reverseContour(p);
}

/** Reverse a single-contour outline's direction (flip winding). */
function reverseContour(o: GlyphOutline): GlyphOutline {
  // Simple approach for our generated ellipses: rebuild from sampled anchors.
  // Cheap + correct enough for a proof: re-emit with swapped control points.
  const pts: { x: number; y: number; c?: [number, number, number, number] }[] = [];
  for (const cmd of o) {
    if (cmd.type === "M") {
      pts.push({ x: cmd.x, y: cmd.y });
    } else if (cmd.type === "C") {
      pts.push({ x: cmd.x, y: cmd.y, c: [cmd.x1, cmd.y1, cmd.x2, cmd.y2] });
    }
  }
  const out: GlyphOutline = [];
  const last = pts[pts.length - 1];
  out.push({ type: "M", x: last.x, y: last.y });
  for (let i = pts.length - 1; i > 0; i--) {
    const cur = pts[i];
    const prev = pts[i - 1];
    if (cur.c) {
      out.push({ type: "C", x1: cur.c[2], y1: cur.c[3], x2: cur.c[0], y2: cur.c[1], x: prev.x, y: prev.y });
    } else {
      out.push({ type: "L", x: prev.x, y: prev.y });
    }
  }
  out.push({ type: "Z" });
  return out;
}

const H = DEFAULT_METRICS.capHeight; // 700

const glyphs: GlyphDef[] = [
  {
    char: "H",
    codepoint: 0x48,
    name: "H",
    advanceWidth: 760,
    alternates: [[...rect(120, 0, 250, H), ...rect(510, 0, 640, H), ...rect(250, 300, 510, 400)]],
  },
  {
    char: "I",
    codepoint: 0x49,
    name: "I",
    advanceWidth: 360,
    alternates: [[...rect(115, 0, 245, H)]],
  },
  {
    char: "L",
    codepoint: 0x4c,
    name: "L",
    advanceWidth: 560,
    alternates: [[...rect(120, 0, 250, H), ...rect(120, 0, 540, 120)]],
  },
  {
    char: "O",
    codepoint: 0x4f,
    name: "O",
    advanceWidth: 780,
    // outer ellipse (cw) + inner hole (ccw) => proves counters render hollow
    alternates: [[...ellipse(390, H / 2, 330, 360, true), ...ellipse(390, H / 2, 200, 230, false)]],
  },
  {
    char: "T",
    codepoint: 0x54,
    name: "T",
    advanceWidth: 700,
    alternates: [[...rect(80, H - 130, 700, H), ...rect(325, 0, 455, H - 130)]],
  },
];

const spec = {
  familyName: "Handwrite Proof A",
  styleName: "Regular",
  ...DEFAULT_METRICS,
  glyphs,
};

const font = buildFont(spec);
const bytes = fontToUint8Array(font);

const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "proof-a.otf");
writeFileSync(outPath, bytes);

// --- round-trip self-check: parse the bytes back with opentype.js -----------
const reparsed = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const numGlyphs = reparsed.glyphs.length;
const hGlyph = reparsed.charToGlyph("H");
const oGlyph = reparsed.charToGlyph("O");

console.log("PROOF A — opentype.js font generation");
console.log("  wrote:           ", outPath, `(${bytes.byteLength} bytes)`);
console.log("  family:          ", reparsed.names.fontFamily?.en ?? "(n/a)");
console.log("  unitsPerEm:      ", reparsed.unitsPerEm);
console.log("  glyph count:     ", numGlyphs, "(incl .notdef + space)");
console.log("  'H' -> glyph:    ", hGlyph?.name, "advance", hGlyph?.advanceWidth);
console.log("  'O' contours:    ", oGlyph?.path?.commands?.filter((c) => c.type === "Z").length, "(expect 2: outline + hole)");

const ok = numGlyphs >= 7 && hGlyph?.name === "H" && reparsed.unitsPerEm === 1000;
console.log(ok ? "  RESULT: PASS ✅ (valid font round-trips)" : "  RESULT: FAIL ❌");
if (!ok) process.exit(1);
