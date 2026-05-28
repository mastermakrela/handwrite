/**
 * Build a font from captured strokes (single pass OR multiple passes) and a demo
 * page. Multiple passes -> alternates per letter -> calt cycling (natural variation).
 *
 *   bun run font:build [strokes-or-passes.json]
 *
 * Accepts either format:
 *   - single pass:  { "a": [[{x,y,pressure}...]], ... }     (the capture tool's older export)
 *   - passes:       [ {pass1}, {pass2}, ... ]               (multi-draft export)
 *
 * Pipeline: glyphsFromPasses (TS lib: curve-fit + baseline anchor + tight spacing)
 *   -> tools/_outlines.json -> tools/assemble.py (fontTools: CFF .otf + .woff2 + calt).
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { glyphsFromPasses, type Pass } from "../src/lib/handwrite/font/glyph-from-passes";
import { CHAR_GROUPS, type CharDef } from "../src/lib/handwrite/charsets";
import { DEFAULT_METRICS, type GlyphOutline, type PathCommand } from "../src/lib/handwrite/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inPath = process.argv[2] || join(root, "handwriting-passes.json");
const raw = JSON.parse(readFileSync(inPath, "utf8"));
const passes: Pass[] = Array.isArray(raw) ? raw : [raw]; // single object => one pass

// char defs: prefer known sets, else synthesize
const known = new Map<string, CharDef>();
for (const g of CHAR_GROUPS) for (const c of g.chars) known.set(c.char, c);
const present = new Set<string>();
for (const p of passes) for (const k of Object.keys(p)) if (p[k]?.length) present.add(k);
const chars: CharDef[] = [...present].map(
  (ch) => known.get(ch) ?? { char: ch, codepoint: ch.codePointAt(0)!, name: "u" + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0") },
);

const glyphs = glyphsFromPasses(passes, chars);

const compact = (o: GlyphOutline): (string | number)[][] =>
  o.map((c: PathCommand) =>
    c.type === "M" ? ["M", Math.round(c.x), Math.round(c.y)]
    : c.type === "L" ? ["L", Math.round(c.x), Math.round(c.y)]
    : c.type === "C" ? ["C", Math.round(c.x1), Math.round(c.y1), Math.round(c.x2), Math.round(c.y2), Math.round(c.x), Math.round(c.y)]
    : ["Z"],
  );

const interchange = {
  familyName: "My Handwriting",
  unitsPerEm: DEFAULT_METRICS.unitsPerEm,
  ascender: DEFAULT_METRICS.ascender,
  descender: DEFAULT_METRICS.descender,
  glyphs: glyphs.map((g) => ({ name: g.name, codepoint: g.codepoint, advanceWidth: g.advanceWidth, alternates: g.alternates.map(compact) })),
};
const outlinesPath = join(root, "tools", "_outlines.json");
writeFileSync(outlinesPath, JSON.stringify(interchange));

const passCount = passes.length;
const altCounts = glyphs.map((g) => g.alternates.length);
console.log(`input: ${inPath}`);
console.log(`  passes: ${passCount} · glyphs: ${glyphs.length} · alternates/glyph: min ${Math.min(...altCounts)} max ${Math.max(...altCounts)}`);

// assemble with fontTools (calt)
const py = Bun.spawnSync([".venv/bin/python", join(root, "tools", "assemble.py"), outlinesPath, root]);
const out = py.stdout.toString().trim();
if (!py.success) { console.error(py.stderr.toString()); process.exit(1); }
const res = JSON.parse(out);
console.log(`  built: MyHandwriting.otf + .woff2 · ${res.glyphs} glyphs · calt rules: ${res.caltRules} ${res.varied ? "(VARIED ✓)" : "(single sample)"}`);

// demo page (woff2, calt enabled)
const woff2 = readFileSync(join(root, "MyHandwriting.woff2"));
const b64 = Buffer.from(woff2).toString("base64");
const has = (ch: string) => glyphs.some((g) => g.char === ch);
const demo = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My Handwriting</title><style>
@font-face{font-family:"MyHand";src:url(data:font/woff2;base64,${b64}) format("woff2")}
:root{--h:"MyHand",cursive}
body{margin:0;background:#f6f7fb;color:#1d2347;font-family:-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:48px 24px 96px}
.tag{color:#7a8499;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;margin:34px 0 6px}
.hand{font-family:var(--h);font-feature-settings:"calt" 1;-webkit-font-feature-settings:"calt" 1}
h1{font-size:3rem;line-height:1.2;margin:.1em 0;font-weight:400}
.card{background:#fff;border:1px solid #e6e9f2;border-radius:14px;padding:18px 22px;margin:10px 0;box-shadow:0 1px 2px rgba(24,32,58,.04)}
.big{font-size:2rem;line-height:1.45}.s22{font-size:22px;line-height:1.6}.muted{color:#7a8499;font-size:.85rem}
</style></head><body><div class="wrap">
<p class="muted">handwrite · ${glyphs.length} glyphs · ${passCount} pass${passCount === 1 ? "" : "es"} · ${res.varied ? "natural variation via calt ✓" : "single sample (capture more passes for variation)"} · on-device</p>
<h1 class="hand">This is your handwriting,<br>now a font.</h1>
<p class="tag">your pangram</p><div class="card hand big">The quick brown fox jumps over the lazy dog</div>
<p class="tag">your name</p><div class="card hand big">Krzysztof Kostrzewa</div>
${has("ł") || has("ä") ? `<p class="tag">diacritics</p><div class="card hand big">Zażółć gęślą jaźń · Schöne Grüße</div>` : ""}
<p class="tag">does variation show? (repeats should differ if you captured passes)</p>
<div class="card hand big">aaaa · eee · mississippi · committee · 11111</div>
<p class="tag">at text size — does it read as you?</p>
<div class="card hand s22">Sphinx of black quartz, judge my vow. Pack my box with five dozen liquor jugs. How razorback-jumping frogs can level six piqued gymnasts.</div>
<p class="tag">the set you captured</p>
<div class="card hand big">abcdefghijklmnopqrstuvwxyz<br>ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>0 1 2 3 4 5 6 7 8 9</div>
</div></body></html>`;
writeFileSync(join(root, "demo.html"), demo);
console.log(`  wrote: demo.html (open it)`);
