/**
 * Sentence-mode segmentation — pure, headless-testable.
 *
 * The user writes a known phrase in PRINT style (pen lifted between letters) on
 * one wide baseline, then drops vertical dividers in the gaps. We assign whole
 * strokes to the segment their horizontal centre falls into (no stroke cutting),
 * then remap each segment into the per-character VIRT cell convention so the
 * existing font builder treats it identically to a grid-captured glyph.
 */
import { VIRT, BASELINE_FRAC, XHEIGHT_FRAC } from "./space";
import type { Stroke } from "$lib/capture.svelte";

/** Mean x of a stroke's points (its horizontal centre). */
export function strokeCentroidX(s: Stroke): number {
  if (!s.length) return 0;
  return s.reduce((sum, p) => sum + p.x, 0) / s.length;
}

/**
 * Bucket whole strokes into segments delimited by vertical dividers.
 * `dividerXs` need not be sorted. Returns `dividerXs.length + 1` segments
 * (one more bucket than dividers); a stroke joins the bucket whose x-range
 * contains its centroid. Strokes are kept in their original order within a
 * segment.
 */
export function assignStrokesToSegments(strokes: Stroke[], dividerXs: number[]): Stroke[][] {
  const dividers = [...dividerXs].sort((a, b) => a - b);
  const segments: Stroke[][] = Array.from({ length: dividers.length + 1 }, () => []);
  for (const s of strokes) {
    const cx = strokeCentroidX(s);
    // first divider to the right of the centroid → that segment index
    let idx = dividers.findIndex((dx) => cx < dx);
    if (idx === -1) idx = dividers.length; // past the last divider
    segments[idx].push(s);
  }
  return segments;
}

/**
 * Map one segment's strokes from sentence-canvas coords into the per-char VIRT
 * cell convention used by grid cells (and thus by `glyphsFromPasses`).
 *
 * Vertical: uniform scale anchored so the canvas baseline lands on the cell
 * baseline and the canvas x-height line lands on the cell x-height line, which
 * keeps ascenders/descenders proportional. Horizontal: the same uniform scale
 * (aspect-preserving) with the segment's ink centred in the cell — final
 * inter-letter spacing is re-derived downstream by `applyBearings`, so x only
 * needs to stay in-bounds.
 */
export function normalizeSegmentToCell(
  strokes: Stroke[],
  g: { baselineY: number; xHeightY: number },
): Stroke[] {
  const span = g.baselineY - g.xHeightY;
  if (!strokes.length || span === 0) return [];
  const scale = (VIRT * (BASELINE_FRAC - XHEIGHT_FRAC)) / span;

  // centre on the segment's ink x-extent
  let minX = Infinity;
  let maxX = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
  }
  const segMidX = (minX + maxX) / 2;

  return strokes.map((s) =>
    s.map((p) => ({
      x: (p.x - segMidX) * scale + VIRT / 2,
      y: BASELINE_FRAC * VIRT + (p.y - g.baselineY) * scale,
      pressure: p.pressure,
    })),
  );
}
