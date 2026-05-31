/**
 * Headless smoke test of the in-browser calt font build (no browser).
 *
 * Synthesizes a 2-round `cap.passes` for 'a' (so 'a' gets 2 alternates) plus a
 * single-round 'b' (1 alternate, must NOT cycle), builds the font via the SAME
 * `buildFont`/`buildFontBytes` the preview + export use, re-parses it, and asserts:
 *   1. GSUB table is present;
 *   2. a `calt` feature exists;
 *   3. a lookupType 6 (chain-context) lookup exists;
 *   4. glyph `a.alt1` exists with NO unicode, while `a` has its unicode;
 *   5. 'b' (1 round) produces a base glyph but no `.alt` glyph.
 */
import opentype from "opentype.js";
import { buildGlyphs, buildFontBytes } from "../src/lib/handwrite/font/preview-font";
import type { CharDef } from "../src/lib/handwrite/charsets";
import type { Pass } from "../src/lib/capture.svelte";

// A simple print-style stroke (vertical-ish), varied slightly per round.
const stroke = (x: number, dy: number) =>
  Array.from({ length: 8 }, (_, i) => ({ x, y: 250 + (i / 7) * (300 + dy), pressure: 0.5 }));

// 'a' drawn in two rounds (=> 2 alternates), 'b' drawn only in round 1 (=> 1).
const passes: Pass[] = [
  { a: [stroke(100, 0)], b: [stroke(200, 0)] },
  { a: [stroke(105, 20)] },
];
const chars: CharDef[] = [
  { char: "a", codepoint: 0x61, name: "a" },
  { char: "b", codepoint: 0x62, name: "b" },
];

const glyphs = buildGlyphs(passes, chars);
const aDef = glyphs.find((g) => g.name === "a");
const bDef = glyphs.find((g) => g.name === "b");
const altCountOk = aDef?.alternates.length === 2 && bDef?.alternates.length === 1;

const { bytes } = buildFontBytes(passes, chars);
const parsed = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gsub = (parsed.tables as any).gsub;
const gsubOk = !!gsub;
const featTags: string[] = gsub ? gsub.features.map((f: { tag: string }) => f.tag) : [];
const caltOk = featTags.includes("calt");
const lookupTypes: number[] = gsub ? gsub.lookups.map((l: { lookupType: number }) => l.lookupType) : [];
const type6Ok = lookupTypes.includes(6);
const type1Ok = lookupTypes.includes(1);

// glyph presence + unicode rules
const names = new Set<string>();
for (let i = 0; i < parsed.glyphs.length; i++) names.add(parsed.glyphs.get(i).name ?? "");
const aGlyph = parsed.charToGlyph("a");
const aAlt1 = (() => {
  for (let i = 0; i < parsed.glyphs.length; i++) {
    const g = parsed.glyphs.get(i);
    if (g.name === "a.alt1") return g;
  }
  return null;
})();
const aHasUnicode = !!(aGlyph && aGlyph.unicode === 0x61);
const altHasNoUnicode = !!aAlt1 && (aAlt1.unicode === undefined || aAlt1.unicodes.length === 0);
const bHasNoAlt = !names.has("b.alt1");

/**
 * Walk the parsed GSUB chain lookup over a synthetic run of N identical bases
 * and assert the emitted substitutions cycle through every variant in order and
 * keep repeating (no two adjacent glyphs identical, full coverage of variants).
 * By design the start-of-run (empty-backtrack) rule lands on variants[1], then
 * each position advances one variant from the previous, so a 2-variant 'a' run
 * shapes as alt1, a, alt1, a, alt1. This mirrors a shaper's left-to-right pass:
 * at each position we pick
 * the FIRST type-6 format-3 subtable whose 1-glyph backtrack matches the glyph
 * already produced at the previous position (and whose input matches the base),
 * falling back to the empty-backtrack subtable at run start. Catches ordering
 * regressions (specific-prev-first vs empty-backtrack-last) that the structural
 * checks above would miss. Pure read of the parsed tables — no shaping engine.
 */
function cyclingOk(): { ok: boolean; trace: string[] } {
  if (!gsub) return { ok: false, trace: ["no gsub"] };
  // gid <-> name maps from the parsed font
  const nameOf: string[] = [];
  for (let i = 0; i < parsed.glyphs.length; i++) nameOf[i] = parsed.glyphs.get(i).name ?? "";
  const baseGid = parsed.charToGlyph("a").index;

  // single-sub lookups: index -> output gid (format-2: coverage[0] -> substitute[0])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookups: any[] = gsub.lookups;
  const singleOut = (lookupIndex: number): number => {
    const st = lookups[lookupIndex].subtables[0];
    return st.substitute[0];
  };

  // the chain lookup referenced by calt (first type-6)
  const chainLookup = lookups.find((l: { lookupType: number }) => l.lookupType === 6);
  if (!chainLookup) return { ok: false, trace: ["no type-6 chain"] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtables: any[] = chainLookup.subtables;

  const cov1 = (c: { glyphs?: number[] } | undefined): number | null =>
    c && c.glyphs && c.glyphs.length ? c.glyphs[0] : null;

  const N = 5;
  const out: number[] = [];
  for (let pos = 0; pos < N; pos++) {
    const prev = pos > 0 ? out[pos - 1] : null;
    // pick the first subtable whose input matches base AND whose backtrack
    // (if any) matches the previous output glyph; empty backtrack matches always.
    let chosen: number | null = null;
    for (const st of subtables) {
      if (cov1(st.inputCoverage?.[0]) !== baseGid) continue;
      const bt = st.backtrackCoverage?.length ? cov1(st.backtrackCoverage[0]) : null;
      if (bt === null || bt === prev) {
        chosen = singleOut(st.lookupRecords[0].lookupListIndex);
        break;
      }
    }
    out.push(chosen ?? baseGid);
  }
  const trace = out.map((g) => nameOf[g]);
  // By design the run starts at variants[1] then advances one variant per step:
  // for 2 variants (a, a.alt1) => alt1, a, alt1, a, alt1.
  const variants = ["a", "a.alt1"];
  const expected = Array.from({ length: N }, (_, i) => variants[(i + 1) % variants.length]);
  const ok = trace.every((t, i) => t === expected[i]);
  return { ok, trace };
}
const cycle = cyclingOk();

console.log("SMOKE — calt font build (in-browser GSUB)");
console.log("  alternates built:", altCountOk ? "OK ✅ (a=2, b=1)" : `FAIL ❌ (a=${aDef?.alternates.length}, b=${bDef?.alternates.length})`);
console.log("  GSUB present:    ", gsubOk ? "OK ✅" : "FAIL ❌");
console.log("  calt feature:    ", caltOk ? `OK ✅ (${featTags.join(",")})` : `FAIL ❌ (${featTags.join(",")})`);
console.log("  type-6 chain:    ", type6Ok ? "OK ✅" : `FAIL ❌ (types=${lookupTypes.join(",")})`);
console.log("  type-1 single:   ", type1Ok ? "OK ✅" : `FAIL ❌ (types=${lookupTypes.join(",")})`);
console.log("  a has unicode:   ", aHasUnicode ? "OK ✅" : "FAIL ❌");
console.log("  a.alt1 no unicode:", altHasNoUnicode ? "OK ✅" : "FAIL ❌");
console.log("  b has no alt:    ", bHasNoAlt ? "OK ✅" : "FAIL ❌");
console.log("  chain cycles:    ", cycle.ok ? `OK ✅ (${cycle.trace.join(",")})` : `FAIL ❌ (${cycle.trace.join(",")})`);

const ok = altCountOk && gsubOk && caltOk && type6Ok && type1Ok && aHasUnicode && altHasNoUnicode && bHasNoAlt && cycle.ok;
console.log(ok ? "  RESULT: PASS ✅" : "  RESULT: FAIL ❌");
process.exit(ok ? 0 : 1);
