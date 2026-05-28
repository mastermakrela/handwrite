/**
 * Shared capture coordinate space, used by both the drawing UI (to place guide
 * lines) and the font builder (to map captured strokes into font units). Keeping
 * these in one place is what lets the two stay in agreement.
 *
 * A cell is a VIRT×VIRT square in "capture space" (y-down, like the screen).
 * The fractions place the writing guides; the builder anchors the BASELINE to
 * font y=0 so descenders (g, j, p, y, ł) can go negative.
 */
export const VIRT = 1000;
export const BASELINE_FRAC = 0.76; // solid line you write on
export const XHEIGHT_FRAC = 0.46; // dashed line — top of x-height letters
export const CAP_FRAC = 0.18; // dashed line — top of capitals/ascenders
