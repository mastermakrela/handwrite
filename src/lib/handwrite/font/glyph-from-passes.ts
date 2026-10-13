/**
 * Turn captured passes into font glyphs.
 *
 * A "pass" is one full attempt at the character set. Multiple passes give us
 * multiple ALTERNATES per character — the raw material for natural variation
 * (cycled later with a `calt` feature). This module:
 *   - maps capture-space strokes into font units, anchored on the BASELINE so
 *     descenders (g, j, p, y, ł) correctly go below it,
 *   - builds each stroke centerline-first: de-jitter the path, then ink it at a
 *     constant width and fit a no-overshoot outline (see capture/centerline),
 *   - assigns each character a single, consistent advance width across all its
 *     alternates (so cycling them doesn't make the spacing jitter), with tight
 *     side bearings so words don't look spaced-out.
 */
import { strokeToRings, type InputPoint, type StrokeOptions } from "../capture/stroke";
import { fitClosedSmooth, type Pt } from "../capture/simplify";
import { smoothCenterline, type CenterlineOpts } from "../capture/centerline";
import { BASELINE_FRAC, CAP_FRAC, VIRT } from "../capture/space";
import { DEFAULT_METRICS, type GlyphDef, type GlyphOutline } from "../types";
import { shiftX, xCoords } from "./metrics";
import type { CharDef } from "../charsets";

export type Pass = Record<string, InputPoint[][]>; // char -> strokes

/** Shape check for rounds read from a file: a non-empty list of char -> strokes -> points maps. */
export function isPassList(v: unknown): boolean {
  const isPoint = (p: unknown) =>
    typeof p === "object" &&
    p !== null &&
    Number.isFinite((p as InputPoint).x) &&
    Number.isFinite((p as InputPoint).y);
  const isPass = (pass: unknown) =>
    typeof pass === "object" &&
    pass !== null &&
    !Array.isArray(pass) &&
    Object.values(pass).every(
      (strokes) =>
        Array.isArray(strokes) && strokes.every((s) => Array.isArray(s) && s.every(isPoint)),
    );
  return Array.isArray(v) && v.length > 0 && v.every(isPass);
}

export type VariationMode = "cycle" | "single";

export interface BuildOpts {
  sideBearing?: number; // font units each side (lower = tighter words)
  fitEpsilon?: number; // RDP tolerance for the (already-smooth) stroke outline
  centerline?: Partial<CenterlineOpts>; // jitter/corner cleanup before inking
  stroke?: StrokeOptions; // pen width / taper
  /** "cycle": one alternate per pass (calt variation). "single": one clean glyph. */
  variation?: VariationMode;
}
const DEFAULTS = {
  sideBearing: 38,
  fitEpsilon: 3,
  centerline: {
    spacing: 4,
    dejitterRadius: 3,
    iterations: 2,
    corners: "keep" as const,
    cornerAngle: 75,
  },
  stroke: {
    size: 30,
    thinning: 0,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    capTaper: 0,
  },
  variation: "cycle" as VariationMode,
};

/** One captured rendition (its strokes) -> a font-space outline (not yet x-normalized). */
function normalizeStrokes(strokes: InputPoint[][], opts: Required<BuildOpts>): GlyphOutline {
  // baseline anchored: capture y at BASELINE_FRAC maps to font 0; above is +, below is -
  const scale = DEFAULT_METRICS.capHeight / ((BASELINE_FRAC - CAP_FRAC) * VIRT);
  const baselineY = BASELINE_FRAC * VIRT;
  const toFont = (p: Pt) => ({ x: p[0] * scale, y: (baselineY - p[1]) * scale });
  const center = opts.centerline as CenterlineOpts;

  const out: GlyphOutline = [];
  for (const stroke of strokes) {
    // 1. clean the centerline (de-jitter, keep/round corners) BEFORE giving it width
    const smooth = smoothCenterline(
      stroke.map((p) => [p.x, p.y] as Pt),
      center,
    );
    if (smooth.length < 2) continue;
    // 2. ink it (round caps). Re-attach captured pen pressure by arc-position so
    //    the stroker can modulate width when thinning > 0 (pressure mode); when
    //    thinning is 0 the pressure is ignored and the stroke stays monoline.
    const m = stroke.length;
    const n = smooth.length;
    const inputs: InputPoint[] = smooth.map(([x, y], i) => {
      const j = Math.round((i / (n - 1)) * (m - 1));
      return { x, y, pressure: stroke[j]?.pressure ?? 0.5 };
    });
    for (const ring of strokeToRings(inputs, opts.stroke)) {
      // 3. fit the (already smooth) outline as a no-overshoot closed spline
      const fitted = fitClosedSmooth(ring, opts.fitEpsilon);
      if (!fitted) continue;
      const s = toFont(fitted.start);
      out.push({ type: "M", x: s.x, y: s.y });
      for (const seg of fitted.segs) {
        const c1 = toFont(seg.c1),
          c2 = toFont(seg.c2),
          e = toFont(seg.end);
        out.push({ type: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: e.x, y: e.y });
      }
      out.push({ type: "Z" });
    }
  }
  return out;
}

function bounds(o: GlyphOutline) {
  const allX = o.flatMap(xCoords);
  return allX.length ? { min: Math.min(...allX), max: Math.max(...allX) } : { min: 0, max: 0 };
}

/** Build glyph definitions (with alternates) for the given chars from all passes. */
export function glyphsFromPasses(
  passes: Pass[],
  chars: CharDef[],
  options: BuildOpts = {},
): GlyphDef[] {
  const opts = {
    ...DEFAULTS,
    ...options,
    centerline: { ...DEFAULTS.centerline, ...options.centerline },
    stroke: { ...DEFAULTS.stroke, ...options.stroke },
  } as Required<BuildOpts>;
  const glyphs: GlyphDef[] = [];

  for (const cd of chars) {
    // every pass that drew this char, newest first: the latest (most practiced)
    // pass becomes alternates[0] — the default glyph — and "single" takes just it
    const drawn = passes.filter((p) => p[cd.char]?.length).reverse();
    // "single": one clean glyph from the latest pass; "cycle": one alternate per pass
    const sources = opts.variation === "single" ? drawn.slice(0, 1) : drawn;
    const raw: GlyphOutline[] = [];
    for (const pass of sources) {
      const o = normalizeStrokes(pass[cd.char], opts);
      if (o.length) raw.push(o);
    }
    if (!raw.length) continue;

    // common advance = widest ink + 2*bearing; left-align each alternate at bearing
    const inks = raw.map((o) => {
      const b = bounds(o);
      return { o, b, w: b.max - b.min };
    });
    const maxW = Math.max(...inks.map((i) => i.w));
    const advanceWidth = Math.round(maxW + 2 * opts.sideBearing);
    const alternates = inks.map(({ o, b }) =>
      o.map((cmd) => shiftX(cmd, opts.sideBearing - b.min)),
    );

    glyphs.push({
      char: cd.char,
      codepoint: cd.codepoint,
      name: cd.name,
      advanceWidth,
      alternates,
    });
  }
  return glyphs;
}
