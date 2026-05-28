/**
 * Turn captured passes into font glyphs.
 *
 * A "pass" is one full attempt at the character set. Multiple passes give us
 * multiple ALTERNATES per character — the raw material for natural variation
 * (cycled later with a `calt` feature). This module:
 *   - maps capture-space strokes into font units, anchored on the BASELINE so
 *     descenders (g, j, p, y, ł) correctly go below it,
 *   - fits smooth cubic outlines (RDP + Catmull-Rom, via the capture lib),
 *   - assigns each character a single, consistent advance width across all its
 *     alternates (so cycling them doesn't make the spacing jitter), with tight
 *     side bearings so words don't look spaced-out.
 */
import { strokeToRings, type InputPoint, type StrokeOptions } from "../capture/stroke";
import { simplifyAndFit, type Pt } from "../capture/simplify";
import { BASELINE_FRAC, CAP_FRAC, VIRT } from "../capture/space";
import { DEFAULT_METRICS, type GlyphDef, type GlyphOutline, type PathCommand } from "../types";
import type { CharDef } from "../charsets";

export type Pass = Record<string, InputPoint[][]>; // char -> strokes

export interface BuildOpts {
  sideBearing?: number; // font units each side (lower = tighter words)
  fitEpsilon?: number; // RDP tolerance in capture units
  stroke?: StrokeOptions;
}
const DEFAULTS = { sideBearing: 38, fitEpsilon: 8, stroke: { size: 46, thinning: 0.55, smoothing: 0.5, streamline: 0.5, simulatePressure: false } };

const xs = (cmd: PathCommand): number[] =>
  cmd.type === "M" || cmd.type === "L" ? [cmd.x] : cmd.type === "Q" ? [cmd.x1, cmd.x] : cmd.type === "C" ? [cmd.x1, cmd.x2, cmd.x] : [];
const shiftX = (cmd: PathCommand, dx: number): PathCommand =>
  cmd.type === "M" || cmd.type === "L" ? { ...cmd, x: cmd.x + dx }
  : cmd.type === "Q" ? { ...cmd, x1: cmd.x1 + dx, x: cmd.x + dx }
  : cmd.type === "C" ? { ...cmd, x1: cmd.x1 + dx, x2: cmd.x2 + dx, x: cmd.x + dx } : cmd;

/** One captured rendition (its strokes) -> a font-space outline (not yet x-normalized). */
function normalizeStrokes(strokes: InputPoint[][], opts: Required<BuildOpts>): GlyphOutline {
  // baseline anchored: capture y at BASELINE_FRAC maps to font 0; above is +, below is -
  const scale = DEFAULT_METRICS.capHeight / ((BASELINE_FRAC - CAP_FRAC) * VIRT);
  const baselineY = BASELINE_FRAC * VIRT;
  const toFont = (p: Pt) => ({ x: p[0] * scale, y: (baselineY - p[1]) * scale });

  const out: GlyphOutline = [];
  for (const stroke of strokes) {
    for (const ring of strokeToRings(stroke, opts.stroke)) {
      const fitted = simplifyAndFit(ring, opts.fitEpsilon);
      if (!fitted) continue;
      const s = toFont(fitted.start);
      out.push({ type: "M", x: s.x, y: s.y });
      for (const seg of fitted.segs) {
        const c1 = toFont(seg.c1), c2 = toFont(seg.c2), e = toFont(seg.end);
        out.push({ type: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: e.x, y: e.y });
      }
      out.push({ type: "Z" });
    }
  }
  return out;
}

function bounds(o: GlyphOutline) {
  const allX = o.flatMap(xs);
  return allX.length ? { min: Math.min(...allX), max: Math.max(...allX) } : { min: 0, max: 0 };
}

/** Build glyph definitions (with alternates) for the given chars from all passes. */
export function glyphsFromPasses(passes: Pass[], chars: CharDef[], options: BuildOpts = {}): GlyphDef[] {
  const opts = { ...DEFAULTS, ...options, stroke: { ...DEFAULTS.stroke, ...(options.stroke ?? {}) } } as Required<BuildOpts>;
  const glyphs: GlyphDef[] = [];

  for (const cd of chars) {
    // one alternate per pass that has this char drawn
    const raw: GlyphOutline[] = [];
    for (const pass of passes) {
      const strokes = pass[cd.char];
      if (strokes && strokes.length) {
        const o = normalizeStrokes(strokes, opts);
        if (o.length) raw.push(o);
      }
    }
    if (!raw.length) continue;

    // common advance = widest ink + 2*bearing; left-align each alternate at bearing
    const inks = raw.map((o) => { const b = bounds(o); return { o, b, w: b.max - b.min }; });
    const maxW = Math.max(...inks.map((i) => i.w));
    const advanceWidth = Math.round(maxW + 2 * opts.sideBearing);
    const alternates = inks.map(({ o, b }) => o.map((cmd) => shiftX(cmd, opts.sideBearing - b.min)));

    glyphs.push({ char: cd.char, codepoint: cd.codepoint, name: cd.name, advanceWidth, alternates });
  }
  return glyphs;
}
