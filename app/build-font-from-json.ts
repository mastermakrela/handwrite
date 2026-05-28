/**
 * Build a font from a captured handwriting-strokes.json (the export from the
 * capture tool) and generate a self-contained demo page.
 *
 *   bun app/build-font-from-json.ts [strokes.json]
 *
 * Outputs:  MyHandwriting.otf  ·  demo.html  ·  docs/myfont-specimen.svg
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { strokesToGlyphOutline, type InputPoint } from "../src/lib/handwrite/capture/stroke";
import { applyBearings } from "../src/lib/handwrite/font/metrics";
import { buildFont, fontToUint8Array } from "../src/lib/handwrite/font/opentype-builder";
import { DEFAULT_METRICS, type GlyphDef, type GlyphOutline } from "../src/lib/handwrite/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = process.argv[2] || join(root, "handwriting-strokes.json");
const data: Record<string, InputPoint[][]> = JSON.parse(await Bun.file(jsonPath).text());

const VIRT = 1000;
const CELL = { width: VIRT, height: VIRT };
const FM = { unitsPerEm: DEFAULT_METRICS.unitsPerEm, baseline: DEFAULT_METRICS.baseline, capHeight: DEFAULT_METRICS.capHeight };
const OPTS = { size: 46, thinning: 0.55, smoothing: 0.5, streamline: 0.5, simulatePressure: false, curveFit: true, fitEpsilon: 8 };
const NAMES: Record<string, string> = {
  ".": "period", ",": "comma", "!": "exclam", "?": "question", "'": "quotesingle",
  '"': "quotedbl", "-": "hyphen", ":": "colon", ";": "semicolon", "(": "parenleft", ")": "parenright",
};
const glyphName = (ch: string) => NAMES[ch] ?? (/[A-Za-z]/.test(ch) ? ch : "u" + ch.charCodeAt(0).toString(16));

const glyphs: GlyphDef[] = [];
const byChar = new Map<string, { outline: GlyphOutline; advanceWidth: number }>();
for (const ch of Object.keys(data)) {
  const strokes = data[ch];
  if (!strokes?.length) continue;
  const outline = strokesToGlyphOutline(strokes, CELL, FM, OPTS);
  if (!outline.length) continue;
  const m = applyBearings(outline, { sideBearing: 70 });
  glyphs.push({ char: ch, codepoint: ch.charCodeAt(0), name: glyphName(ch), advanceWidth: m.advanceWidth, alternates: [m.outline] });
  byChar.set(ch, { outline: m.outline, advanceWidth: m.advanceWidth });
}

const font = buildFont({ familyName: "My Handwriting", styleName: "Regular", ...DEFAULT_METRICS, glyphs });
const bytes = fontToUint8Array(font);
writeFileSync(join(root, "MyHandwriting.otf"), bytes);

// ---- demo.html : real browser rendering via @font-face (base64, offline) ----
const b64 = Buffer.from(bytes).toString("base64");
const demo = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Handwriting — demo</title>
<style>
  @font-face { font-family:"MyHand"; src:url(data:font/otf;base64,${b64}) format("opentype"); }
  :root{ --hand:"MyHand", cursive; }
  body{ margin:0; background:#f6f7fb; color:#1d2347; font-family:-apple-system,"Segoe UI",Roboto,sans-serif; }
  .wrap{ max-width:820px; margin:0 auto; padding:48px 24px 96px; }
  .tag{ color:#7a8499; font-size:.8rem; text-transform:uppercase; letter-spacing:.06em; margin:36px 0 6px; }
  h1{ font-family:var(--hand); font-weight:400; font-size:3rem; line-height:1.2; margin:.1em 0; }
  .pangram{ font-family:var(--hand); font-size:2rem; line-height:1.4; }
  .name{ font-family:var(--hand); font-size:2.4rem; }
  .p{ font-family:var(--hand); line-height:1.6; }
  .s32{ font-size:32px } .s22{ font-size:22px } .s16{ font-size:16px }
  .row{ font-family:var(--hand); font-size:1.9rem; letter-spacing:.04em; word-spacing:.1em; }
  .card{ background:#fff; border:1px solid #e6e9f2; border-radius:14px; padding:18px 22px; margin:10px 0;
    box-shadow:0 1px 2px rgba(24,32,58,.04); }
  .muted{ color:#7a8499; font-size:.85rem; }
  .cmp{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .cmp .sys{ font-family:-apple-system,"Segoe UI",sans-serif; }
  @media(max-width:600px){ .cmp{ grid-template-columns:1fr } }
</style></head><body><div class="wrap">
  <p class="muted">handwrite · generated ${glyphs.length} glyphs from your strokes · 100% on-device</p>
  <h1>This is your handwriting,<br>now a font.</h1>

  <p class="tag">your original pangram</p>
  <div class="card pangram">The quick brown fox jumps over the lazy dog</div>

  <p class="tag">your name</p>
  <div class="card name">Krzysztof Kostrzewa</div>

  <p class="tag">does it read as you at text sizes?</p>
  <div class="card">
    <p class="p s32">Sphinx of black quartz, judge my vow.</p>
    <p class="p s22">Sphinx of black quartz, judge my vow. Pack my box with five dozen liquor jugs.</p>
    <p class="p s16">Sphinx of black quartz, judge my vow. Pack my box with five dozen liquor jugs. How razorback-jumping frogs can level six piqued gymnasts.</p>
  </div>

  <p class="tag">your font vs a system font (same text)</p>
  <div class="card cmp">
    <div class="p s22">Handwriting is personal.</div>
    <div class="sys s22">Handwriting is personal.</div>
  </div>

  <p class="tag">the full set you captured</p>
  <div class="card">
    <div class="row">abcdefghijklmnopqrstuvwxyz</div>
    <div class="row">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
    <div class="row">0 1 2 3 4 5 6 7 8 9</div>
    <div class="row">. , ! ? ' " - : ; ( )</div>
  </div>
  <p class="muted">Note: every letter is a single sample, so repeats look identical (stamped). Capturing 3–4 samples per letter + a calt feature is what makes it look naturally varied — that's the next step.</p>
</div></body></html>`;
writeFileSync(join(root, "demo.html"), demo);

// ---- specimen.svg : render from outlines directly (reliable headless view) ----
function dStr(o: GlyphOutline): string {
  const f = (n: number) => n.toFixed(1);
  return o.map((c) =>
    c.type === "M" ? `M${f(c.x)} ${f(c.y)}` : c.type === "L" ? `L${f(c.x)} ${f(c.y)}`
    : c.type === "C" ? `C${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`
    : c.type === "Q" ? `Q${f(c.x1)} ${f(c.y1)} ${f(c.x)} ${f(c.y)}` : "Z").join(" ");
}
const SPACE = 300;
function renderLine(text: string, y: number, s: number): { svg: string; w: number } {
  let x = 0; const parts: string[] = [];
  for (const ch of text) {
    if (ch === " ") { x += SPACE; continue; }
    const g = byChar.get(ch);
    if (!g) { x += SPACE; continue; }
    parts.push(`<g transform="translate(${(x * s).toFixed(1)},${y}) scale(${s},${-s})"><path d="${dStr(g.outline)}" fill="#1d2347"/></g>`);
    x += g.advanceWidth;
  }
  return { svg: parts.join(""), w: x * s };
}
const S = 0.085, LH = 130;
const lines = ["The quick brown fox", "jumps over the lazy dog", "Krzysztof Kostrzewa", "Hamburgefonts 0123456789"];
let y = 100, maxW = 0, body = "";
for (const ln of lines) { const r = renderLine(ln, y, S); body += r.svg; maxW = Math.max(maxW, r.w); y += LH; }
const W = Math.ceil(maxW + 60), H = y;
const specimen = `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fbfcfe"/><g transform="translate(30,0)">${body}</g></svg>\n`;
writeFileSync(join(root, "docs", "myfont-specimen.svg"), specimen);

// ---- report ----------------------------------------------------------------
const adv = glyphs.map((g) => g.advanceWidth);
console.log("FONT BUILT from", jsonPath);
console.log(`  glyphs:        ${glyphs.length} (+ .notdef + space)`);
console.log(`  advance width: min ${Math.min(...adv)} · max ${Math.max(...adv)} (varies with ink ✓)`);
console.log(`  wrote:         MyHandwriting.otf · demo.html · docs/myfont-specimen.svg`);
