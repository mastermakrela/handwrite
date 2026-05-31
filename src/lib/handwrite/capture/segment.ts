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
 * Propose divider x-positions that split the writing into the bands of `target`
 * (its token list, INCLUDING spaces). Two things matter:
 *  - Multi-stroke letters (stem+crossbar of "t", stem+dot of "i"/"j", "x"/"k")
 *    must NOT be split, so overlapping/near-touching strokes are first merged
 *    into per-letter clusters.
 *  - Word SPACES are real bands: between two letters separated by a space we
 *    place TWO dividers so an empty band forms for the space token (otherwise
 *    every letter after the first space is off by one).
 * When the clusters map 1:1 onto the non-space tokens, placement is exact and
 * yields exactly `target.length - 1` dividers (so the round can be saved). If
 * the counts don't line up (mis-written), it falls back to one divider per
 * widest between-cluster gap. Pure; does not mutate inputs.
 */
export function proposeDividers(strokes: Stroke[], target: string[]): number[] {
  const targetCount = target.length;
  if (targetCount <= 1 || strokes.length < 2) return [];
  // 1. x-extent per stroke, ordered left→right by left edge
  const ext = strokes
    .map((s) => {
      let min = Infinity,
        max = -Infinity;
      for (const p of s) {
        if (p.x < min) min = p.x;
        if (p.x > max) max = p.x;
      }
      return { min, max };
    })
    .sort((a, b) => a.min - b.min);

  // 2. typical inter-stroke gap (median of positive gaps); within-letter strokes
  //    overlap (gap ≤ 0), so a fraction of this cleanly separates the two cases.
  const raw: number[] = [];
  for (let i = 0; i < ext.length - 1; i++) raw.push(ext[i + 1].min - ext[i].max);
  const positive = raw.filter((g) => g > 0).sort((a, b) => a - b);
  const median = positive.length ? positive[Math.floor(positive.length / 2)] : 0;
  const mergeGap = Math.max(median * 0.55, 1);

  // 3. merge overlapping / near-touching strokes into per-letter clusters
  const clusters: { min: number; max: number }[] = [{ min: ext[0].min, max: ext[0].max }];
  for (let i = 1; i < ext.length; i++) {
    const c = clusters[clusters.length - 1];
    if (ext[i].min - c.max < mergeGap) c.max = Math.max(c.max, ext[i].max);
    else clusters.push({ min: ext[i].min, max: ext[i].max });
  }

  // Map clusters positionally onto the FIRST clusters.length letters of the
  // phrase, so an incomplete line just covers a prefix (no padding to the full
  // phrase — that's what lets a partial round still be saved). Between two
  // written letters: one divider, plus one extra per word-space that sits
  // between them (so the space gets its own empty band).
  const letterIdx: number[] = [];
  for (let i = 0; i < target.length; i++) if (target[i] !== " ") letterIdx.push(i);

  const out: number[] = [];
  for (let j = 0; j < clusters.length - 1; j++) {
    const A = clusters[j].max;
    const w = clusters[j + 1].min - A;
    const spaces = j + 1 < letterIdx.length ? Math.max(0, letterIdx[j + 1] - letterIdx[j] - 1) : 0;
    const n = 1 + spaces;
    for (let k = 1; k <= n; k++) out.push(A + (w * k) / (n + 1));
  }
  return out.sort((a, b) => a - b);
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
