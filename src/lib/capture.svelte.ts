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

export const cap = $state({
  passes: [{}] as Pass[],
  activePass: 0,
  enabled: ["lower", "upper", "digits", "punct"] as string[],
  target: 5,
  mode: "grid" as "grid" | "sentence",
});

/** transient UI state (not persisted) */
export const ui = $state({ penSeen: false, activeChar: null as string | null, importTick: 0 });

/** Local profiles so people sharing one tablet keep separate strokes. */
export const profiles = $state({ activeId: "", list: [] as Profile[] });

export function chars(): CharDef[] {
  return activeChars(new Set(cap.enabled));
}

type Snapshot = { passes: Pass[]; activePass: number; enabled: string[]; target: number; mode: "grid" | "sentence" };

/** Load a stored snapshot (or sensible defaults) into the active `cap` state. */
function applyToCap(s: Partial<Snapshot> | null) {
  cap.passes = s?.passes?.length ? s.passes : [{}];
  cap.activePass = Math.min(s?.activePass ?? 0, cap.passes.length - 1);
  cap.enabled = s?.enabled ?? ["lower", "upper", "digits", "punct"];
  cap.target = s?.target ?? 5;
  cap.mode = s?.mode === "sentence" ? "sentence" : "grid";
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
      profiles.list = reg.list;
      profiles.activeId = reg.list.some((p: Profile) => p.id === reg.activeId) ? reg.activeId : reg.list[0].id;
    } else {
      // first run — seed a Default profile, migrating any pre-profile data into it
      const id = newId();
      profiles.list = [{ id, name: "Default" }];
      profiles.activeId = id;
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) localStorage.setItem(dataKey(id), legacy); // (LEGACY_KEY stays as an extra backup)
      saveRegistry();
    }
    loadActiveData();
  } catch {}
}
export function save() {
  if (!profiles.activeId) return;
  localStorage.setItem(
    dataKey(profiles.activeId),
    JSON.stringify({ passes: cap.passes, activePass: cap.activePass, enabled: cap.enabled, target: cap.target, mode: cap.mode }),
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
