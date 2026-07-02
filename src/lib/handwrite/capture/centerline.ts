/**
 * Centerline-first stroke smoothing.
 *
 * The old pipeline let perfect-freehand turn raw (jittery) points straight into
 * a variable-width *silhouette*, then tried to smooth that filled polygon. That
 * doubles the jitter (both ribbon edges wobble) and reads as "polygon fill", not
 * a pen stroke.
 *
 * Instead we clean the CENTERLINE before giving it any width:
 *   dedupe → arc-length resample → low-pass (de-jitter) → corner detect
 *   → corner-preserving Chaikin smoothing
 * The result is a smooth path that the stroker can ink at a constant width with
 * round caps — i.e. a fineliner, like Apple Notes / Notability.
 *
 * De-jitter is a moving-average LOW-PASS, not RDP. RDP deletes points, which
 * collapses genuine curves (an `o` becomes a polygon) and leaves hand-shake on
 * the points it keeps — the latter spawns false "corners" and visible cuts. A
 * low-pass instead pulls every point toward its neighbours: it attenuates the
 * shake while keeping the curve a curve.
 *
 * Knobs:
 *   - `dejitterRadius` (de-jitter): moving-average window radius in points; 0 off.
 *   - `iterations` (smoothing): corner-preserving Chaikin rounding passes.
 *   - `corners`: "keep" leaves deliberate direction changes sharp (k, v, z, w);
 *     "round" smooths through everything for a fully flowing look.
 */
import { type Pt } from "./simplify";

export type CornerMode = "keep" | "round";

export interface CenterlineOpts {
  /** target spacing between resampled points (capture units). */
  spacing: number;
  /** moving-average window radius (points) — the de-jitter strength. 0 = off. */
  dejitterRadius: number;
  /** Chaikin smoothing passes (0–4). */
  iterations: number;
  /** whether to preserve sharp corners or round everything. */
  corners: CornerMode;
  /** turn angle (degrees) above which a vertex counts as a deliberate corner. */
  cornerAngle: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Drop consecutive duplicate points (the capture stream emits each point twice). */
function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/** Resample a polyline to roughly even arc-length spacing. */
function resample(pts: Pt[], spacing: number): Pt[] {
  if (pts.length < 2 || spacing <= 0) return pts.slice();
  const out: Pt[] = [pts[0]];
  let prev = pts[0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const target = pts[i];
    let segLen = dist(prev, target);
    while (segLen > 0 && acc + segLen >= spacing) {
      const t = (spacing - acc) / segLen;
      const np: Pt = [prev[0] + (target[0] - prev[0]) * t, prev[1] + (target[1] - prev[1]) * t];
      out.push(np);
      prev = np;
      acc = 0;
      segLen = dist(prev, target);
    }
    acc += segLen;
    prev = target;
  }
  const last = pts[pts.length - 1];
  // always keep the endpoint when it's all we have — a stroke shorter than
  // `spacing` (an i-dot, a period) must stay a 2-point segment, not vanish
  if (out.length < 2 || dist(out[out.length - 1], last) > spacing * 0.5) out.push(last);
  return out;
}

/**
 * Moving-average low-pass: pull each point toward the mean of its neighbours
 * within `radius`. Endpoints stay put (so the stroke keeps its length). This
 * attenuates hand-shake without deleting points, so curves stay curved.
 */
function lowpass(pts: Pt[], radius: number): Pt[] {
  if (radius < 1 || pts.length < 3) return pts;
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) {
      out.push(pts[i]);
      continue;
    }
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n - 1, i + radius);
    let sx = 0;
    let sy = 0;
    for (let j = lo; j <= hi; j++) {
      sx += pts[j][0];
      sy += pts[j][1];
    }
    const c = hi - lo + 1;
    out.push([sx / c, sy / c]);
  }
  return out;
}

/** Turn angle at b, in degrees: 0 = straight through, 180 = full reversal. */
function turnAngleDeg(a: Pt, b: Pt, c: Pt): number {
  const v1: Pt = [b[0] - a[0], b[1] - a[1]];
  const v2: Pt = [c[0] - b[0], c[1] - b[1]];
  const l1 = Math.hypot(v1[0], v1[1]);
  const l2 = Math.hypot(v2[0], v2[1]);
  if (l1 === 0 || l2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** One Chaikin corner-cutting pass on an OPEN polyline (endpoints fixed). */
function chaikinOpen(pts: Pt[], iterations: number): Pt[] {
  let cur = pts;
  for (let k = 0; k < iterations; k++) {
    if (cur.length < 3) break;
    const next: Pt[] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i];
      const b = cur[i + 1];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/**
 * Smooth a path while keeping flagged corner vertices sharp: split the path at
 * each corner, Chaikin-smooth each run independently (run endpoints stay put),
 * then stitch the runs back together.
 */
function smoothPreservingCorners(pts: Pt[], isCorner: boolean[], iterations: number): Pt[] {
  const runs: Pt[][] = [];
  let run: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    run.push(pts[i]);
    if (isCorner[i] && i < pts.length - 1) {
      runs.push(run);
      run = [pts[i]];
    }
  }
  runs.push(run);

  const out: Pt[] = [];
  for (const r of runs) {
    for (const p of chaikinOpen(r, iterations)) {
      const last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
  }
  return out;
}

/**
 * Flag deliberate corners. Direction change is measured across a WINDOW of
 * `win` points each side — a real corner turns over a span, while point-to-point
 * angles on a dense path are tiny even at a sharp corner (which is why measuring
 * adjacent samples never fired). Non-maximum suppression keeps one flag per
 * corner so the splitter doesn't shatter it into a flat spot.
 */
function cornerFlags(pts: Pt[], angleThresh: number, win: number): boolean[] {
  const n = pts.length;
  const ang = pts.map((_, i) =>
    i < win || i >= n - win ? 0 : turnAngleDeg(pts[i - win], pts[i], pts[i + win]),
  );
  const flags = ang.map((a) => a > angleThresh);
  for (let i = 0; i < n; i++) {
    if (!flags[i]) continue;
    const lo = Math.max(0, i - win);
    const hi = Math.min(n - 1, i + win);
    for (let j = lo; j <= hi; j++) {
      if (j !== i && ang[j] > ang[i]) {
        flags[i] = false;
        break;
      }
    }
  }
  return flags;
}

/** Clean one raw captured stroke into a smooth centerline polyline. */
export function smoothCenterline(raw: Pt[], opts: CenterlineOpts): Pt[] {
  let pts = dedupe(raw);
  if (pts.length < 3) return pts;
  pts = resample(pts, opts.spacing);
  pts = lowpass(pts, opts.dejitterRadius);
  if (pts.length < 3) return pts;

  // window ≈ a fixed arc length (~14 capture units) regardless of sample spacing
  const win = Math.max(2, Math.round(14 / opts.spacing));
  const isCorner =
    opts.corners === "keep" ? cornerFlags(pts, opts.cornerAngle, win) : pts.map(() => false);
  return smoothPreservingCorners(pts, isCorner, opts.iterations);
}
