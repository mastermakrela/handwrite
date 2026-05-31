/**
 * Capture state (Svelte 5 runes). One reactive store shared by the page and the
 * cells: multiple passes (drafts) over the character set, an active pass, which
 * alphabet groups are enabled, and a target number of passes for variation.
 */
import { activeChars, type CharDef } from "$lib/handwrite/charsets";

export type Pt = { x: number; y: number; pressure: number };
export type Stroke = Pt[];
export type Pass = Record<string, Stroke[]>; // char -> strokes

export type Profile = { id: string; name: string };

// Per-profile data lives under `handwrite.capture.v2.<id>`; the registry of
// profiles (and which one is active) under REG_KEY. LEGACY_KEY is the old
// single-bucket key — migrated into the first profile on upgrade and then left
// in place as an extra backup.
const REG_KEY = "handwrite.profiles.v1";
const LEGACY_KEY = "handwrite.capture.v2";
const dataKey = (id: string) => `handwrite.capture.v2.${id}`;
const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "p" + Date.now().toString(36) + Math.random().toString(36).slice(2);

/** perfect-freehand nib settings, used for the on-screen ink while writing. */
export type Pen = { size: number; thinning: number };
export const DEFAULT_PEN: Pen = { size: 30, thinning: 0.6 };

/** Output-font tuning, adjustable on the Preview page (weight / roundness / spacing). */
export type FontTune = { weight: number; smoothing: number; spacing: number };
export const DEFAULT_FONT: FontTune = { weight: 30, smoothing: 0.72, spacing: 38 };

export const cap = $state({
  passes: [{}] as Pass[],
  activePass: 0,
  enabled: ["lower", "upper", "digits", "punct"] as string[],
  target: 3,
  mode: "sentence" as "grid" | "sentence",
  pen: { ...DEFAULT_PEN } as Pen,
  font: { ...DEFAULT_FONT } as FontTune,
});

/** Full perfect-freehand options derived from the current pen (the on-screen ink). */
export function penOptions() {
  return { size: cap.pen.size, thinning: cap.pen.thinning, smoothing: 0.5, streamline: 0.5, simulatePressure: false };
}

/** glyph-build options derived from the Preview-page font tuning (drives preview + export). */
export function fontBuildOptions() {
  return {
    sideBearing: cap.font.spacing,
    stroke: { size: cap.font.weight, thinning: cap.pen.thinning, smoothing: cap.font.smoothing, streamline: 0.5, simulatePressure: false },
  };
}

/** transient UI state (not persisted) */
export const ui = $state({ penSeen: false, activeChar: null as string | null, importTick: 0 });

/** Local profiles so people sharing one tablet keep separate strokes. */
export const profiles = $state({ activeId: "", list: [] as Profile[] });

export function chars(): CharDef[] {
  return activeChars(new Set(cap.enabled));
}

type Snapshot = { passes: Pass[]; activePass: number; enabled: string[]; target: number; mode: "grid" | "sentence"; pen: Pen; font: FontTune };

/** Load a stored snapshot (or sensible defaults) into the active `cap` state. */
function applyToCap(s: Partial<Snapshot> | null) {
  cap.passes = s?.passes?.length ? s.passes : [{}];
  cap.activePass = Math.min(s?.activePass ?? 0, cap.passes.length - 1);
  cap.enabled = s?.enabled ?? ["lower", "upper", "digits", "punct"];
  cap.target = s?.target ?? 3;
  cap.pen = { ...DEFAULT_PEN, ...(s?.pen ?? {}) };
  cap.font = { ...DEFAULT_FONT, ...(s?.font ?? {}) };
  // Default opening view is Write (sentence). Existing profiles persist a mode and
  // keep it; only new/blank snapshots (no stored mode) fall back to sentence.
  cap.mode = s?.mode === "grid" ? "grid" : "sentence";
  ui.importTick++; // force any in-progress stroke on every canvas to reset
}
function loadActiveData() {
  try { applyToCap(JSON.parse(localStorage.getItem(dataKey(profiles.activeId)) || "null")); }
  catch { applyToCap(null); }
}
function saveRegistry() {
  localStorage.setItem(REG_KEY, JSON.stringify({ activeId: profiles.activeId, list: profiles.list }));
}

export function load() {
  try {
    const reg = JSON.parse(localStorage.getItem(REG_KEY) || "null");
    if (reg?.list?.length) {
      // gentle rename of the old auto-seeded "Default" profile to "you"
      profiles.list = reg.list.map((p: Profile) => (p.name === "Default" ? { ...p, name: "you" } : p));
      profiles.activeId = profiles.list.some((p) => p.id === reg.activeId) ? reg.activeId : profiles.list[0].id;
      if (profiles.list.some((p, i) => reg.list[i]?.name !== p.name)) saveRegistry();
    } else {
      // first run — seed "you" (active, gets any migrated data) plus an example
      // second persona so the profile switcher is self-explanatory.
      const youId = newId();
      const friendId = newId();
      profiles.list = [{ id: youId, name: "you" }, { id: friendId, name: "your friend" }];
      profiles.activeId = youId;
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) localStorage.setItem(dataKey(youId), legacy); // (LEGACY_KEY stays as an extra backup)
      saveRegistry();
    }
    loadActiveData();
  } catch {}
}
export function save() {
  if (!profiles.activeId) return;
  localStorage.setItem(
    dataKey(profiles.activeId),
    JSON.stringify({ passes: cap.passes, activePass: cap.activePass, enabled: cap.enabled, target: cap.target, mode: cap.mode, pen: cap.pen, font: cap.font }),
  );
  saveRegistry();
}

export function createProfile(name: string) {
  save(); // persist the current profile first
  const id = newId();
  profiles.list = [...profiles.list, { id, name: name.trim() || "Untitled" }];
  profiles.activeId = id;
  applyToCap(null); // start blank
  save();
}
export function switchProfile(id: string) {
  if (id === profiles.activeId) return;
  save(); // persist the current profile before leaving it
  profiles.activeId = id;
  loadActiveData();
  saveRegistry();
}
export function renameProfile(id: string, name: string) {
  const n = name.trim();
  if (!n) return;
  profiles.list = profiles.list.map((p) => (p.id === id ? { ...p, name: n } : p));
  saveRegistry();
}
export function deleteProfile(id: string) {
  if (profiles.list.length <= 1) return; // always keep at least one
  localStorage.removeItem(dataKey(id));
  profiles.list = profiles.list.filter((p) => p.id !== id);
  if (profiles.activeId === id) {
    profiles.activeId = profiles.list[0].id;
    loadActiveData();
  }
  saveRegistry();
}

/** Number of rounds that have at least one character drawn. */
export function roundsDone(): number {
  return cap.passes.filter((p) => Object.values(p).some((s) => s?.length)).length;
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
/**
 * Sentence mode: write one normalized segment per target char into the active
 * pass (same per-char `Stroke[]` shape grid mode produces). Space tokens are the
 * empty word-gap bands — skipped. Repeated chars in a prompt resolve to
 * last-occurrence-wins for v1. Segments without strokes are skipped so a missed
 * letter doesn't wipe an earlier capture.
 */
export function applySentence(targetChars: string[], segments: Stroke[][]) {
  for (let i = 0; i < targetChars.length; i++) {
    if (targetChars[i] === " ") continue; // word gap, not a glyph
    const strokes = segments[i];
    if (strokes && strokes.length) setStrokes(targetChars[i], strokes);
  }
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
