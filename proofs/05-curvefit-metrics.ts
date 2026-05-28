/**
 * PROOF E — answers the adversary's two sharpest TECHNICAL objections, in code:
 *
 *   (T2) "the RDP-simplify + cubic-fit that supposedly fixes the 119-point bloat
 *         DOES NOT EXIST — stroke.ts emits only straight L segments."
 *        -> now implemented (capture/simplify.ts). We run a NOISY (hand-tremor)
 *           stroke through BOTH paths and show the command count collapse plus a
 *           smooth-vs-faceted render (docs/curvefit.svg).
 *
 *   (T3) "metrics (advance width / side bearings) are hardcoded to 600 — uniform
 *         mechanical spacing is the dominant 'looks broken' failure."
 *        -> now implemented (font/metrics.ts). Advance width is derived from each
 *           glyph's ink extent; we show narrow vs wide glyphs advance differently
 *           and render uniform-vs-metric spacing (docs/spacing.svg).
 *
 * NOTE on honesty: the stroke is synthetic-but-noisy (deterministic tremor +
 * drift + variable pressure), NOT a real human's ink. The "does this look like
 * MY handwriting?" test genuinely requires real people and remains the project's
 * kill-gate (see docs/PLAN.md). This proof only claims to fix the falsifiable
 * curve-quality and spacing objections — which it does.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { strokesToGlyphOutline, type InputPoint } from "../src/lib/handwrite/capture/stroke.ts";
import { applyBearings } from "../src/lib/handwrite/font/metrics.ts";
import { buildFont, fontToUint8Array } from "../src/lib/handwrite/font/opentype-builder.ts";
import { DEFAULT_METRICS, type GlyphOutline } from "../src/lib/handwrite/types.ts";

const CELL = { width: 600, height: 700 };
const FM = { unitsPerEm: DEFAULT_METRICS.unitsPerEm, baseline: DEFAULT_METRICS.baseline, capHeight: DEFAULT_METRICS.capHeight };
const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
const docsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
mkdirSync(outDir, { recursive: true });

/** A 'C' arc with deterministic tremor + drift + variable pressure (messy, not geometric). */
function noisyC(): InputPoint[] {
  const pts: InputPoint[] = [];
  const cx = 360, cy = 350, r = 250, N = 90;
  const a0 = (50 * Math.PI) / 180, a1 = (310 * Math.PI) / 180;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = a0 + (a1 - a0) * t;
    const tremor = 9 * Math.sin(a * 11) + 5 * Math.sin(a * 23 + 1); // high-freq hand wobble
    const drift = 12 * Math.sin(a * 2 + 0.7); // low-freq drift
    pts.push({
      x: cx + (r + drift) * Math.cos(a) + tremor,
      y: cy - (r + drift) * Math.sin(a) + tremor * 0.6,
      pressure: 0.3 + 0.55 * Math.sin(Math.PI * t),
    });
  }
  return pts;
}

function countCmds(o: GlyphOutline) {
  return { total: o.length, lines: o.filter((c) => c.type === "L").length, curves: o.filter((c) => c.type === "C").length };
}

// --- T2: curve fit -----------------------------------------------------------
const stroke = noisyC();
const raw = strokesToGlyphOutline([stroke], CELL, FM, { size: 46, simulatePressure: false, curveFit: false });
const fitted = strokesToGlyphOutline([stroke], CELL, FM, { size: 46, simulatePressure: false, curveFit: true, fitEpsilon: 2.2 });
const rawC = countCmds(raw);
const fitC = countCmds(fitted);

// --- helpers to render outlines to SVG (font y-up -> svg y-down) -------------
function dString(o: GlyphOutline): string {
  const f = (n: number) => n.toFixed(1);
  return o
    .map((c) =>
      c.type === "M" ? `M${f(c.x)} ${f(c.y)}`
      : c.type === "L" ? `L${f(c.x)} ${f(c.y)}`
      : c.type === "C" ? `C${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`
      : c.type === "Q" ? `Q${f(c.x1)} ${f(c.y1)} ${f(c.x)} ${f(c.y)}`
      : "Z",
    )
    .join(" ");
}
function panel(o: GlyphOutline, tx: number, color: string, label: string, sub: string): string {
  const s = 0.34;
  return (
    `<text x="${tx}" y="20" font-family="ui-sans-serif,system-ui" font-size="13" fill="#33415c">${label}</text>` +
    `<text x="${tx}" y="38" font-family="ui-monospace,monospace" font-size="11" fill="#7a8aa0">${sub}</text>` +
    `<g transform="translate(${tx},300) scale(${s},${-s})"><path d="${dString(o)}" fill="none" stroke="${color}" stroke-width="6"/>` +
    o.filter((c) => c.type === "M" || c.type === "L" || c.type === "C").map((c: any) => `<circle cx="${c.x}" cy="${c.y}" r="6" fill="${color}"/>`).join("") +
    `</g>`
  );
}
const curvefitSvg =
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320" viewBox="0 0 560 320">` +
  `<rect width="560" height="320" fill="#fbfcfe"/>` +
  panel(raw, 24, "#c0392b", "before — raw polyline", `${rawC.total} cmds · ${rawC.lines} lines · 0 curves`) +
  panel(fitted, 300, "#0b6e4f", "after — RDP + cubic fit", `${fitC.total} cmds · ${fitC.curves} curves`) +
  `</svg>\n`;
writeFileSync(join(docsDir, "curvefit.svg"), curvefitSvg);

// --- T3: metrics from ink ----------------------------------------------------
function rect(x0: number, y0: number, x1: number, y1: number): GlyphOutline {
  return [
    { type: "M", x: x0, y: y1 }, { type: "L", x: x1, y: y1 },
    { type: "L", x: x1, y: y0 }, { type: "L", x: x0, y: y0 }, { type: "Z" },
  ];
}
const SB = 70;
const samples = [
  { name: "narrow (|)", o: rect(0, 0, 90, 700) },
  { name: "medium (n)", o: rect(0, 0, 300, 500) },
  { name: "wide (m)", o: rect(0, 0, 520, 500) },
];
const metricRows = samples.map((s) => {
  const m = applyBearings(s.o, { sideBearing: SB });
  return { ...s, ink: m.inkWidth, advance: m.advanceWidth };
});

// spacing render: letters I (narrow) and O (wide), laid out uniform vs metric
const I = rect(0, 0, 110, 700);
const O: GlyphOutline = (() => {
  const K = 0.5523, cx = 330, cy = 350, rx = 300, ry = 350;
  return [
    { type: "M", x: cx + rx, y: cy },
    { type: "C", x1: cx + rx, y1: cy + ry * K, x2: cx + rx * K, y2: cy + ry, x: cx, y: cy + ry },
    { type: "C", x1: cx - rx * K, y1: cy + ry, x2: cx - rx, y2: cy + ry * K, x: cx - rx, y: cy },
    { type: "C", x1: cx - rx, y1: cy - ry * K, x2: cx - rx * K, y2: cy - ry, x: cx, y: cy - ry },
    { type: "C", x1: cx + rx * K, y1: cy - ry, x2: cx + rx, y2: cy - ry * K, x: cx + rx, y: cy },
    { type: "Z" },
  ];
})();
const seq = [I, O, I, O, O, I]; // "IOIOOI" — alternating narrow/wide stresses spacing
const uniformAdv = 600;
function rowSvg(baselineY: number, useMetric: boolean): string {
  let x = 20;
  const s = 0.095;
  const parts: string[] = [];
  for (const g of seq) {
    const m = applyBearings(g, { sideBearing: SB }); // same shifted glyph in both rows
    const adv = useMetric ? m.advanceWidth : uniformAdv; // only the advance differs
    parts.push(`<g transform="translate(${x},${baselineY}) scale(${s},${-s})"><path d="${dString(m.outline)}" fill="#1a1a2e"/></g>`);
    x += adv * s;
  }
  return parts.join("");
}
const spacingSvg =
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">` +
  `<rect width="480" height="300" fill="#fbfcfe"/>` +
  `<text x="20" y="26" font-family="ui-sans-serif,system-ui" font-size="13" fill="#c0392b">uniform advance (old · 600 everywhere) — gap after every I, O's crowd</text>` +
  rowSvg(130, false) +
  `<text x="20" y="172" font-family="ui-sans-serif,system-ui" font-size="13" fill="#0b6e4f">metric advance (new · derived from ink) — even rhythm</text>` +
  rowSvg(276, true) +
  `</svg>\n`;
writeFileSync(join(docsDir, "spacing.svg"), spacingSvg);

// --- build + validate a font from the smooth, metric'd C ---------------------
const cM = applyBearings(fitted, { sideBearing: SB });
const font = buildFont({
  familyName: "Handwrite Proof E",
  styleName: "Regular",
  ...DEFAULT_METRICS,
  glyphs: [{ char: "C", codepoint: 0x43, name: "C", advanceWidth: cM.advanceWidth, alternates: [cM.outline] }],
});
const bytes = fontToUint8Array(font);
writeFileSync(join(outDir, "proof-e.otf"), bytes);
const reparsed = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

console.log("PROOF E — curve-fit + metrics (addressing adversary T2 & T3)");
console.log("  T2 curve-fit (noisy 'C'):");
console.log(`     before: ${rawC.total} cmds (${rawC.lines} straight lines, 0 curves)`);
console.log(`     after:  ${fitC.total} cmds (${fitC.curves} cubic curves, 0 lines)  -> docs/curvefit.svg`);
console.log(`     reduction: ${(100 * (1 - fitC.total / rawC.total)).toFixed(0)}% fewer commands, now smooth`);
console.log("  T3 metrics from ink (was hardcoded 600):");
for (const r of metricRows) console.log(`     ${r.name.padEnd(12)} ink=${String(r.ink).padStart(3)}  advance=${r.advance}`);
console.log("     -> docs/spacing.svg (uniform vs metric)");
console.log(`  'C' glyph advance from ink: ${reparsed.charToGlyph("C")?.advanceWidth} (not 600)`);

const advancesVary = metricRows[0].advance < metricRows[1].advance && metricRows[1].advance < metricRows[2].advance;
const ok = fitC.curves > 0 && fitC.lines === 0 && fitC.total < rawC.total / 2 && advancesVary;
console.log(ok ? "  RESULT: PASS ✅ (curves replace lines; advances scale with ink)" : "  RESULT: FAIL ❌");
if (!ok) process.exit(1);
