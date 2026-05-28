/**
 * PROOF C — "Can a captured pen stroke become a real font glyph?"
 *
 * Simulates an Apple-Pencil capture (a pressure-varying curved stroke for the
 * letter 'C'), runs it through the project's capture pipeline
 * (perfect-freehand outline -> polygon-clipping flatten -> normalize into the
 * em-square), assembles a one-letter font with opentype.js, and round-trips it.
 *
 * This proves the *cheapest* ingestion mode (direct-draw) reaches a valid font
 * with zero backend and zero computer vision — pure TypeScript in the browser.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { strokesToGlyphOutline, type InputPoint } from "../src/lib/handwrite/capture/stroke.ts";
import { buildFont, fontToUint8Array } from "../src/lib/handwrite/font/opentype-builder.ts";
import { DEFAULT_METRICS } from "../src/lib/handwrite/types.ts";

const CELL = { width: 600, height: 700 }; // screen-space capture cell (y-down)

/** Synthesize a curved, pressure-varying stroke shaped like a 'C'. */
function syntheticC(): InputPoint[] {
  const pts: InputPoint[] = [];
  const cx = 360;
  const cy = 350;
  const r = 270;
  const N = 64;
  // sweep the left 250° of a circle -> a "C" that opens to the right
  const a0 = (50 * Math.PI) / 180;
  const a1 = (310 * Math.PI) / 180;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = a0 + (a1 - a0) * t;
    pts.push({
      x: cx + r * Math.cos(a),
      y: cy - r * Math.sin(a),
      pressure: 0.35 + 0.5 * Math.sin(Math.PI * t), // taper at the ends
    });
  }
  return pts;
}

const outline = strokesToGlyphOutline(
  [syntheticC()],
  CELL,
  { unitsPerEm: DEFAULT_METRICS.unitsPerEm, baseline: DEFAULT_METRICS.baseline, capHeight: DEFAULT_METRICS.capHeight },
  { size: 46, simulatePressure: false }, // curve-fit on by default (see Proof E)
);

const moves = outline.filter((c) => c.type === "M").length;
const curves = outline.filter((c) => c.type === "C").length;

const spec = {
  familyName: "Handwrite Proof C",
  styleName: "Regular",
  ...DEFAULT_METRICS,
  glyphs: [{ char: "C", codepoint: 0x43, name: "C", advanceWidth: 700, alternates: [outline] }],
};

const font = buildFont(spec);
const bytes = fontToUint8Array(font);

const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "proof-c.otf");
writeFileSync(outPath, bytes);

// round-trip
const reparsed = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const cGlyph = reparsed.charToGlyph("C");
const cmds = cGlyph?.path?.commands?.length ?? 0;

console.log("PROOF C — pen stroke -> perfect-freehand outline -> font glyph");
console.log("  wrote:           ", outPath, `(${bytes.byteLength} bytes)`);
console.log("  outline contours:", moves);
console.log("  cubic curves:    ", curves, "(smooth fit — see Proof E for before/after)");
console.log("  'C' glyph cmds:  ", cmds, "(non-empty path round-tripped)");

const ok = moves >= 1 && curves > 4 && cmds > 4 && cGlyph?.name === "C";
console.log(ok ? "  RESULT: PASS ✅ (stroke became a valid, smooth glyph)" : "  RESULT: FAIL ❌");
if (!ok) process.exit(1);
