import { getStroke } from "perfect-freehand";
import { penOptions, type Stroke } from "$lib/capture.svelte";

/** Outline a captured stroke as a fillable Path2D using the current pen, or null if it has too few points. */
export function strokePath(s: Stroke): Path2D | null {
  if (s.length === 0) return null;
  const o = getStroke(
    s.map((p) => [p.x, p.y, p.pressure ?? 0.5]),
    penOptions(),
  ) as number[][];
  if (o.length < 2) return null;
  const p = new Path2D();
  o.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}
