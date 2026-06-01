// Canvas ink palette + a reactive `dark` flag.
//
// The CSS theme tokens live in app.css and re-theme automatically, but the
// capture surfaces draw onto <canvas>, where colours are set imperatively and
// can't read CSS variables. This module mirrors the system colour-scheme into a
// rune so canvas redraws react to it, and hands back a matching ink palette.
// Canvas *backgrounds* stay in CSS via --canvas-bg.

const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export const theme = $state({ dark: mq?.matches ?? false });

mq?.addEventListener("change", (e) => (theme.dark = e.matches));

export type CanvasInk = {
  ink: string; // committed/active strokes
  onion: string; // faint previous-pass strokes
  guide: string; // baseline / x-height / cap guide lines
  label: string; // per-band target-char labels (sentence view)
  divider: string; // segment dividers (sentence view)
  over: string; // strokes spilling past the phrase (warning)
  tintEven: string; // alternating segment band tints
  tintOdd: string;
  tintBeyond: string; // band past the target count
};

const LIGHT: CanvasInk = {
  ink: "#1b1f3b",
  onion: "#c1c8ea",
  guide: "#cdd2ee",
  label: "#9aa0c8",
  divider: "#4a38aa",
  over: "#c0392b",
  tintEven: "rgba(74,56,170,0.10)",
  tintOdd: "rgba(74,56,170,0.05)",
  tintBeyond: "rgba(220,80,80,0.10)",
};

const DARK: CanvasInk = {
  ink: "#e9ebf6",
  onion: "#4d5488",
  guide: "#414873",
  label: "#8c93c2",
  divider: "#b3a8f0",
  over: "#ff9b9b",
  tintEven: "rgba(150,135,240,0.16)",
  tintOdd: "rgba(150,135,240,0.08)",
  tintBeyond: "rgba(255,120,120,0.14)",
};

/** Reading this inside an $effect/redraw ties the draw to the colour-scheme. */
export function canvasInk(): CanvasInk {
  return theme.dark ? DARK : LIGHT;
}
