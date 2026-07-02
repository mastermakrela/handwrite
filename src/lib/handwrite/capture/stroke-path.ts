import { getStroke } from "perfect-freehand";
import { penOptions, type Stroke } from "$lib/capture.svelte";

// Canvases redraw on every pointermove, and re-running getStroke for each
// committed stroke is the hot cost, so cache the Path2D per stroke. Committed
// strokes are never mutated, but the in-progress stroke grows in place — the
// stored length catches that and rebuilds it. Pen changes reset the cache.
let cache = new WeakMap<Stroke, { len: number; path: Path2D | null }>();
let cacheKey = "";

/** Outline a captured stroke as a fillable Path2D using the current pen, or null if it has too few points. */
export function strokePath(s: Stroke): Path2D | null {
  const opts = penOptions();
  const key = `${opts.size}:${opts.thinning}`;
  if (key !== cacheKey) {
    cacheKey = key;
    cache = new WeakMap();
  }
  const hit = cache.get(s);
  if (hit && hit.len === s.length) return hit.path;

  let path: Path2D | null = null;
  if (s.length > 0) {
    const o = getStroke(
      s.map((p) => [p.x, p.y, p.pressure ?? 0.5]),
      opts,
    ) as number[][];
    if (o.length >= 2) {
      path = new Path2D();
      o.forEach(([x, y], i) => (i ? path!.lineTo(x, y) : path!.moveTo(x, y)));
      path.closePath();
    }
  }
  cache.set(s, { len: s.length, path });
  return path;
}
