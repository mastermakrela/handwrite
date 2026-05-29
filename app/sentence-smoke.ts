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

// four letters across a wide canvas; "i" (seg 1) is two strokes (stem + dot)
const strokes: Stroke[] = [
  line(100, 250, 100, baselineY), // h-ish stem @x≈100
  line(300, xHeightY, 300, baselineY), // i stem  @x≈300
  line(295, 360, 305, 360, 3), // i dot   @x≈300
  line(500, xHeightY, 520, baselineY), // o-ish    @x≈510
  line(700, xHeightY, 680, baselineY), // x-ish    @x≈690
];
const target = ["h", "i", "o", "x"];
const dividers = [200, 400, 600]; // gaps between the four letters

const segments = assignStrokesToSegments(strokes, dividers);
const lens = segments.map((s) => s.length);
const bucketOk = segments.length === 4 && lens.join(",") === "1,2,1,1";

const g = { baselineY, xHeightY };
const passes = [Object.fromEntries(target.map((ch, k) => [ch, normalizeSegmentToCell(segments[k], g)]))];
const chars = target.map((ch) => ({ char: ch, codepoint: ch.codePointAt(0)!, name: ch }));
const glyphs = glyphsFromPasses(passes, chars);

const font = buildFont({ familyName: "Sentence Smoke", styleName: "Regular", ...DEFAULT_METRICS, glyphs });
const parsed = opentype.parse(fontToUint8Array(font).buffer);
const parseOk = target.every((ch) => !!parsed.charToGlyph(ch)) && parsed.glyphs.length >= target.length + 1;

console.log("SMOKE — sentence segmentation");
console.log("  bucket strokes: ", bucketOk ? `OK ✅ (lens=[${lens}])` : `FAIL ❌ (lens=[${lens}])`);
console.log("  glyphs built:   ", glyphs.length === 4 ? "OK ✅ (4)" : `FAIL ❌ (${glyphs.length})`);
console.log("  font parses:    ", parseOk ? `OK ✅ (${parsed.glyphs.length} glyphs)` : "FAIL ❌");
const ok = bucketOk && glyphs.length === 4 && parseOk;
console.log(ok ? "  RESULT: PASS ✅" : "  RESULT: FAIL ❌");
process.exit(ok ? 0 : 1);
