/**
 * Headless smoke test of sentence-mode segmentation (no browser).
 *
 * Synthesizes print-style strokes for four "letters" at known x-positions plus
 * dividers in the gaps, then asserts:
 *   1. assignStrokesToSegments buckets whole strokes by centroid x — including a
 *      two-stroke letter ("i": stem + dot) that must land wholly in one segment;
 *   2. normalizeSegmentToCell → glyphsFromPasses → buildFont yields a valid OTF
 *      that opentype.js can parse and that contains the expected glyphs.
 */
import opentype from "opentype.js";
import { assignStrokesToSegments, normalizeSegmentToCell } from "../src/lib/handwrite/capture/segment";
import { glyphsFromPasses } from "../src/lib/handwrite/font/glyph-from-passes";
import { buildFont, fontToUint8Array } from "../src/lib/handwrite/font/opentype-builder";
import { BASELINE_FRAC, XHEIGHT_FRAC, VIRT } from "../src/lib/handwrite/capture/space";
import { DEFAULT_METRICS } from "../src/lib/handwrite/types";
import type { Stroke } from "../src/lib/capture.svelte";

const baselineY = BASELINE_FRAC * VIRT; // 760
const xHeightY = XHEIGHT_FRAC * VIRT; // 460

const line = (x0: number, y0: number, x1: number, y1: number, n = 8): Stroke =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, pressure: 0.5 };
  });

// Target "hi ox": four letters + an empty space-token band between the words.
// "i" (seg 1) is two strokes (stem + dot); segment 2 (the space) stays empty.
const strokes: Stroke[] = [
  line(100, 250, 100, baselineY), // h-ish stem @x≈100
  line(300, xHeightY, 300, baselineY), // i stem  @x≈300
  line(295, 360, 305, 360, 3), // i dot   @x≈300
  // (no ink in the word gap around x≈500 — the space band)
  line(700, xHeightY, 720, baselineY), // o-ish    @x≈710
  line(900, xHeightY, 880, baselineY), // x-ish    @x≈890
];
const target = ["h", "i", " ", "o", "x"];
const dividers = [200, 400, 600, 800]; // boundaries: h|i | space | o|x

const segments = assignStrokesToSegments(strokes, dividers);
const lens = segments.map((s) => s.length);
const bucketOk = segments.length === 5 && lens.join(",") === "1,2,0,1,1"; // space band is empty

const g = { baselineY, xHeightY };
// space token contributes no glyph (mirrors applySentence skipping it)
const pass: Record<string, ReturnType<typeof normalizeSegmentToCell>> = {};
target.forEach((ch, k) => { if (ch !== " ") pass[ch] = normalizeSegmentToCell(segments[k], g); });
const passes = [pass];
const chars = target.filter((ch) => ch !== " ").map((ch) => ({ char: ch, codepoint: ch.codePointAt(0)!, name: ch }));
const glyphs = glyphsFromPasses(passes, chars);

const font = buildFont({ familyName: "Sentence Smoke", styleName: "Regular", ...DEFAULT_METRICS, glyphs });
const parsed = opentype.parse(fontToUint8Array(font).buffer);
const letters = target.filter((ch) => ch !== " ");
const parseOk = letters.every((ch) => !!parsed.charToGlyph(ch)) && parsed.glyphs.length >= letters.length + 1;

console.log("SMOKE — sentence segmentation");
console.log("  bucket strokes: ", bucketOk ? `OK ✅ (lens=[${lens}])` : `FAIL ❌ (lens=[${lens}])`);
console.log("  glyphs built:   ", glyphs.length === 4 ? "OK ✅ (4)" : `FAIL ❌ (${glyphs.length})`);
console.log("  font parses:    ", parseOk ? `OK ✅ (${parsed.glyphs.length} glyphs)` : "FAIL ❌");
const ok = bucketOk && glyphs.length === 4 && parseOk;
console.log(ok ? "  RESULT: PASS ✅" : "  RESULT: FAIL ❌");
process.exit(ok ? 0 : 1);
