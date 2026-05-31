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

// "t h i": t = stem(100–112) + crossbar(86–128, overlaps); h = 220–260; i = stem(360–368) + dot(361–367, overlaps)
const strokes: Stroke[] = [line(100, 112), line(86, 128), line(220, 260), line(360, 368), line(361, 367)];
const d = proposeDividers(strokes, 3);

const insideT = d.some((x) => x > 86 && x < 128);
const insideI = d.some((x) => x > 360 && x < 368);
const between = d.length === 2;
const ok = between && !insideT && !insideI;

console.log("SMOKE — auto-divide clustering");
console.log("  divider count: ", between ? "OK ✅ (2)" : `FAIL ❌ (${d.length}) [${d.map(Math.round)}]`);
console.log("  not inside t:  ", insideT ? "FAIL ❌" : "OK ✅");
console.log("  not inside i:  ", insideI ? "FAIL ❌" : "OK ✅");
console.log(ok ? "  RESULT: PASS ✅" : "  RESULT: FAIL ❌");
process.exit(ok ? 0 : 1);
