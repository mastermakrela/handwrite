/**
 * Metrics engine — the part that actually makes text look spaced like writing
 * rather than stamped into equal boxes.
 *
 * A valid font with bad metrics looks broken. Given a glyph outline, this:
 *   1. measures the ink's horizontal extent (anchors AND control points),
 *   2. shifts the glyph so the ink starts at a consistent left side bearing,
 *   3. sets the advance width = leftBearing + inkWidth + rightBearing.
 *
 * This replaces the previous "hardcode advanceWidth=600 for every glyph"
 * placeholder, so wide letters (m, w) advance more than narrow ones (i, l).
 */

import type { GlyphOutline, PathCommand } from "../types";

export interface BearingOptions {
  /** side bearing in font units (per side). */
  sideBearing: number;
  /** clamp tiny/empty glyphs (e.g. space handled elsewhere) to a min advance. */
  minAdvance?: number;
}

export interface GlyphWithMetrics {
  outline: GlyphOutline;
  advanceWidth: number;
  inkWidth: number;
}

function xCoords(cmd: PathCommand): number[] {
  switch (cmd.type) {
    case "M":
    case "L":
      return [cmd.x];
    case "Q":
      return [cmd.x1, cmd.x];
    case "C":
      return [cmd.x1, cmd.x2, cmd.x];
    case "Z":
      return [];
  }
}

function shiftX(cmd: PathCommand, dx: number): PathCommand {
  switch (cmd.type) {
    case "M":
    case "L":
      return { ...cmd, x: cmd.x + dx };
    case "Q":
      return { ...cmd, x1: cmd.x1 + dx, x: cmd.x + dx };
    case "C":
      return { ...cmd, x1: cmd.x1 + dx, x2: cmd.x2 + dx, x: cmd.x + dx };
    case "Z":
      return cmd;
  }
}

/** Compute spacing from the ink bounding box and normalize the glyph's origin. */
export function applyBearings(outline: GlyphOutline, opts: BearingOptions): GlyphWithMetrics {
  const xs = outline.flatMap(xCoords);
  if (xs.length === 0) {
    return { outline, advanceWidth: opts.minAdvance ?? opts.sideBearing * 2, inkWidth: 0 };
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const inkWidth = maxX - minX;
  // shift so ink's left edge sits at sideBearing
  const dx = opts.sideBearing - minX;
  const outlineShifted = outline.map((c) => shiftX(c, dx));
  const advanceWidth = Math.max(opts.minAdvance ?? 0, Math.round(opts.sideBearing * 2 + inkWidth));
  return { outline: outlineShifted, advanceWidth, inkWidth: Math.round(inkWidth) };
}
