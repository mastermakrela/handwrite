/**
 * Outline simplification + curve fitting.
 *
 * Addresses the "119-point faceted polyline" problem: a perfect-freehand /
 * traced silhouette has hundreds of dense vertices. We (1) Ramer–Douglas–Peucker
 * simplify the ring to a sparse set of anchor points, then (2) fit a smooth
 * closed cubic-Bézier spline through them (Catmull–Rom → Bézier), so the glyph
 * is a handful of curves instead of a hundred line segments — small, smooth, and
 * still faithful to the hand's character.
 *
 * Everything here works in the ring's own coordinate space; because the
 * downstream screen→font transform is affine, the fitted control points map
 * correctly without re-fitting.
 */

export type Pt = [number, number];
export interface CubicSeg {
  c1: Pt;
  c2: Pt;
  end: Pt;
}
export interface FittedRing {
  start: Pt;
  segs: CubicSeg[];
}

function perpDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  // |cross product| / |ab|
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

/** Ramer–Douglas–Peucker on an open polyline. */
export function rdp(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/** Simplify a CLOSED ring (first≈last not required) with RDP. */
export function simplifyRing(ring: Pt[], epsilon: number): Pt[] {
  if (ring.length < 4) return ring.slice();
  // Treat as a loop: run RDP on the open chain p0..pn..p0, then drop the dup.
  const closed = ring.concat([ring[0]]);
  const simplified = rdp(closed, epsilon);
  if (
    simplified.length > 1 &&
    simplified[0][0] === simplified[simplified.length - 1][0] &&
    simplified[0][1] === simplified[simplified.length - 1][1]
  ) {
    simplified.pop();
  }
  return simplified;
}

/**
 * Fit a smooth, closed cubic spline through `pts` using the Catmull–Rom →
 * Bézier conversion (tension 0). Produces one cubic segment per point.
 */
export function catmullRomClosed(pts: Pt[]): FittedRing {
  const n = pts.length;
  const segs: CubicSeg[] = [];
  const at = (i: number) => pts[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    segs.push({ c1, c2, end: p2 });
  }
  return { start: pts[0], segs };
}

/** Full pipeline: dense ring -> RDP -> smooth closed cubic spline. */
export function simplifyAndFit(ring: Pt[], epsilon: number): FittedRing | null {
  const simplified = simplifyRing(ring, epsilon);
  if (simplified.length < 3) return null;
  return catmullRomClosed(simplified);
}

/**
 * Fit a closed ring as a quadratic B-spline (midpoint construction), expressed
 * as cubic segments so the existing emitter can stay unchanged.
 *
 * Unlike Catmull-Rom, this NEVER overshoots its control points — the curve stays
 * inside the polygon's convex hull. That matters for a stroked outline: the round
 * caps of a pen stroke are sharp corners on the ring, and Catmull-Rom bulges out
 * past them (the "unbalanced blob" artifact). The midpoint spline just rounds
 * them cleanly. Use this for outlines that are ALREADY smooth (centerline-first
 * strokes); it trades a little corner crispness for guaranteed no overshoot.
 */
export function fitClosedSmooth(ring: Pt[], epsilon: number): FittedRing | null {
  const pts = simplifyRing(ring, epsilon);
  const n = pts.length;
  if (n < 3) return null;
  const at = (i: number) => pts[((i % n) + n) % n];
  const mid = (i: number): Pt => [(at(i)[0] + at(i + 1)[0]) / 2, (at(i)[1] + at(i + 1)[1]) / 2];

  const start = mid(-1);
  const segs: CubicSeg[] = [];
  let cur = start;
  for (let i = 0; i < n; i++) {
    const ctrl = at(i);
    const end = mid(i);
    // quadratic (cur, ctrl, end) -> equivalent cubic control points
    const c1: Pt = [cur[0] + (2 / 3) * (ctrl[0] - cur[0]), cur[1] + (2 / 3) * (ctrl[1] - cur[1])];
    const c2: Pt = [end[0] + (2 / 3) * (ctrl[0] - end[0]), end[1] + (2 / 3) * (ctrl[1] - end[1])];
    segs.push({ c1, c2, end });
    cur = end;
  }
  return { start, segs };
}
