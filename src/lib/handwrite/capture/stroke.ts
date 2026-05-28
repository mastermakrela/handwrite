/**
 * Direct-draw capture path (iPad / Apple Pencil, or any pointer).
 *
 * Pipeline (all pure TS, runs in the browser):
 *   raw input points  ->  perfect-freehand outline (variable-width silhouette)
 *                     ->  flatten self-intersections (polygon-clipping union)
 *                     ->  normalize into the font em-square (y flipped to y-up)
 *                     ->  GlyphOutline ready for the opentype.js builder
 *
 * perfect-freehand gives us a STROKE OUTLINE (not a centerline), which is exactly
 * what a font glyph contour is — so we skip curve-fitting/stroke-expansion. The
 * one catch (documented in perfect-freehand #70): the raw outline can
 * self-intersect, which fills glyphs wrong — hence the polygon-clipping union.
 */

import { getStroke } from "perfect-freehand";
import polygonClipping from "polygon-clipping";
import type { GlyphOutline } from "../types";
import { simplifyAndFit, type Pt } from "./simplify";

export interface InputPoint {
  x: number;
  y: number;
  /** 0..1 pen pressure; pass real Apple Pencil pressure when available. */
  pressure?: number;
}

export interface StrokeOptions {
  size?: number;
  thinning?: number;
  smoothing?: number;
  streamline?: number;
  /** false when you have real pen pressure; true to fake it from velocity. */
  simulatePressure?: boolean;
}

const DEFAULT_STROKE: Required<StrokeOptions> = {
  size: 16,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
};

type Ring = [number, number][];

/** Turn one captured stroke into one or more clean (non-self-intersecting) rings. */
export function strokeToRings(points: InputPoint[], opts: StrokeOptions = {}): Ring[] {
  const options = { ...DEFAULT_STROKE, ...opts };
  const inputs = points.map((p) => [p.x, p.y, p.pressure ?? 0.5] as [number, number, number]);

  const outline = getStroke(inputs, options) as [number, number][];
  if (outline.length < 3) return [];

  // Self-union flattens any self-intersections into clean simple polygons.
  const unioned = polygonClipping.union([outline as Ring]);

  // MultiPolygon -> flat list of rings (outer + holes).
  const rings: Ring[] = [];
  for (const polygon of unioned) for (const ring of polygon) rings.push(ring as Ring);
  return rings;
}

/**
 * Normalize captured strokes (screen coords, y-down) into a font GlyphOutline
 * (em-square coords, y-up), fitting the drawing into the cell with padding.
 */
export function strokesToGlyphOutline(
  strokes: InputPoint[][],
  cell: { width: number; height: number },
  metrics: { unitsPerEm: number; baseline: number; capHeight: number },
  opts: StrokeOptions & {
    /** fit smooth cubic Béziers instead of raw line segments (default true). */
    curveFit?: boolean;
    /** RDP tolerance in capture-space pixels (default 1.6). */
    fitEpsilon?: number;
  } = {},
): GlyphOutline {
  const curveFit = opts.curveFit ?? true;
  const fitEpsilon = opts.fitEpsilon ?? 1.6;

  const allRings: Ring[] = [];
  for (const s of strokes) allRings.push(...strokeToRings(s, opts));
  if (allRings.length === 0) return [];

  // Scale so the cell height maps to capHeight worth of font units, anchored
  // on the baseline. (A real implementation derives baseline/x-height from
  // template guides; this is the prototype mapping. Horizontal spacing is then
  // assigned by the metrics engine — see font/metrics.ts.)
  const scale = metrics.capHeight / cell.height;
  const toFont = (p: Pt): { x: number; y: number } => ({
    x: p[0] * scale,
    // flip y: screen top (0) -> font top; baseline sits at y=0
    y: metrics.baseline + (cell.height - p[1]) * scale,
  });

  const out: GlyphOutline = [];
  for (const ring of allRings) {
    if (curveFit) {
      // RDP + smooth closed cubic spline (kills the faceted-polyline / point-bloat problem).
      const fitted = simplifyAndFit(ring, fitEpsilon);
      if (!fitted) continue;
      const start = toFont(fitted.start);
      out.push({ type: "M", x: start.x, y: start.y });
      for (const seg of fitted.segs) {
        const c1 = toFont(seg.c1);
        const c2 = toFont(seg.c2);
        const end = toFont(seg.end);
        out.push({ type: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: end.x, y: end.y });
      }
      out.push({ type: "Z" });
    } else {
      // Raw polyline (kept for before/after comparison in proofs).
      let firstPt = true;
      for (const p of ring) {
        const { x, y } = toFont(p);
        out.push(firstPt ? { type: "M", x, y } : { type: "L", x, y });
        firstPt = false;
      }
      out.push({ type: "Z" });
    }
  }
  return out;
}
