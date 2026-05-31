/**
 * Headless test for sentence-mode auto-divide (proposeDividers): multi-stroke
 * letters must NOT be split. "t" (stem + crossbar) and "i" (stem + dot) each
 * have two overlapping strokes; the proposer should cluster them and place
 * dividers only in the real gaps between letters.
 */
import { proposeDividers } from "../src/lib/handwrite/capture/segment";
import type { Stroke } from "../src/lib/capture.svelte";

const line = (x0: number, x1: number): Stroke =>
  [
    { x: x0, y: 500, pressure: 0.5 },
    { x: (x0 + x1) / 2, y: 550, pressure: 0.5 },
    { x: x1, y: 600, pressure: 0.5 },
  ];

// "thi" (no spaces): t = stem(100–112) + crossbar(86–128, overlaps); h = 220–260; i = stem(360–368) + dot(361–367, overlaps)
const strokes: Stroke[] = [line(100, 112), line(86, 128), line(220, 260), line(360, 368), line(361, 367)];
const d = proposeDividers(strokes, ["t", "h", "i"]);
const insideT = d.some((x) => x > 86 && x < 128);
const insideI = d.some((x) => x > 360 && x < 368);
const clusterOk = d.length === 2 && !insideT && !insideI;

// "a b" (a space between two words): wide gap 130→300 should get TWO dividers
// bounding an empty middle band for the space token.
const spaced: Stroke[] = [line(60, 130), line(300, 370)];
const ds = proposeDividers(spaced, ["a", " ", "b"]);
const inGap = ds.filter((x) => x > 130 && x < 300);
const spaceOk = ds.length === 2 && inGap.length === 2; // both dividers sit in the word gap → empty space band between them

// Partial line: only 3 of a 4-letter phrase were written → mark just those 3
// (2 dividers, a prefix), NOT padded to the full phrase, so the round can be
// saved with the letters captured so far.
const three: Stroke[] = [line(40, 90), line(160, 210), line(300, 350)];
const df = proposeDividers(three, ["a", "b", "c", "d"]);
const prefixOk = df.length === 2;

console.log("SMOKE — auto-divide clustering + spaces + partial prefix");
console.log("  t/i not split:  ", clusterOk ? "OK ✅ (2 dividers)" : `FAIL ❌ [${d.map(Math.round)}]`);
console.log("  space bounded:  ", spaceOk ? "OK ✅ (2 dividers in gap)" : `FAIL ❌ [${ds.map(Math.round)}]`);
console.log("  partial prefix: ", prefixOk ? "OK ✅ (3 letters → 2 dividers)" : `FAIL ❌ (${df.length})`);
const ok = clusterOk && spaceOk && prefixOk;
console.log(ok ? "  RESULT: PASS ✅" : "  RESULT: FAIL ❌");
process.exit(ok ? 0 : 1);
