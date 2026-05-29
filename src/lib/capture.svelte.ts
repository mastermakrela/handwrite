/**
 * Capture state (Svelte 5 runes). One reactive store shared by the page and the
 * cells: multiple passes (drafts) over the character set, an active pass, which
 * alphabet groups are enabled, and a target number of passes for variation.
 */
import { activeChars, type CharDef } from "$lib/handwrite/charsets";

export type Pt = { x: number; y: number; pressure: number };
export type Stroke = Pt[];
export type Pass = Record<string, Stroke[]>; // char -> strokes

const KEY = "handwrite.capture.v2";

export const cap = $state({
  passes: [{}] as Pass[],
  activePass: 0,
  enabled: ["lower", "upper", "digits", "punct"] as string[],
  target: 5,
});

/** transient UI state (not persisted) */
export const ui = $state({ penSeen: false, activeChar: null as string | null, importTick: 0 });

export function chars(): CharDef[] {
  return activeChars(new Set(cap.enabled));
}

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s) {
      cap.passes = s.passes?.length ? s.passes : [{}];
      cap.activePass = Math.min(s.activePass ?? 0, cap.passes.length - 1);
      cap.enabled = s.enabled ?? cap.enabled;
      cap.target = s.target ?? 5;
    }
  } catch {}
}
export function save() {
  localStorage.setItem(KEY, JSON.stringify({ passes: cap.passes, activePass: cap.activePass, enabled: cap.enabled, target: cap.target }));
}

export function newPass() {
  cap.passes.push({});
  cap.activePass = cap.passes.length - 1;
  save();
}
export function gotoPass(i: number) {
  cap.activePass = Math.max(0, Math.min(i, cap.passes.length - 1));
  save();
}
export function setStrokes(ch: string, strokes: Stroke[]) {
  // reassign the pass object (not mutate in place) so derived reads re-track
  // new keys reliably — fixes the ✕ button not appearing until reload.
  const p = { ...cap.passes[cap.activePass] };
  if (strokes.length) p[ch] = strokes;
  else delete p[ch];
  cap.passes[cap.activePass] = p;
  save();
}
export function getStrokes(ch: string): Stroke[] {
  return cap.passes[cap.activePass]?.[ch] ?? [];
}
/** Onion-skin source: strokes for this char from the most recent earlier pass. */
export function onionStrokes(ch: string): Stroke[] | null {
  for (let i = cap.activePass - 1; i >= 0; i--) {
    const s = cap.passes[i]?.[ch];
    if (s?.length) return s;
  }
  return null;
}
export function doneInPass(i: number): number {
  const p = cap.passes[i] ?? {};
  return chars().filter((c) => p[c.char]?.length).length;
}
export function toggleGroup(id: string) {
  cap.enabled = cap.enabled.includes(id) ? cap.enabled.filter((x) => x !== id) : [...cap.enabled, id];
  save();
}
export function importPasses(passes: Pass[]) {
  cap.passes = passes.length ? passes : [{}];
  cap.activePass = cap.passes.length - 1;
  ui.importTick++;
  save();
}
