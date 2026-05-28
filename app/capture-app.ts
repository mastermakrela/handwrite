/**
 * handwrite — iPad capture tool (grid edition).
 *
 * A scrollable grid of small cells, one per character, all visible at once — so
 * you capture many specimens per screen instead of one-at-a-time. Each cell
 * captures REAL pen strokes (x, y, pressure via PointerEvents + getCoalescedEvents)
 * in a resolution-independent virtual space, renders live with perfect-freehand,
 * and the whole set builds into a font on-device with opentype.js. Raw strokes
 * also export to JSON for offline analysis. No CV, no backend.
 */
import { getStroke } from "perfect-freehand";
import { strokesToGlyphOutline, type InputPoint } from "../src/lib/handwrite/capture/stroke";
import { applyBearings } from "../src/lib/handwrite/font/metrics";
import { buildFont, fontToUint8Array } from "../src/lib/handwrite/font/opentype-builder";
import { DEFAULT_METRICS, type GlyphDef } from "../src/lib/handwrite/types";

const VIRT = 1000; // virtual cell coordinate space — independent of display size

type Stroke = InputPoint[];
const GROUPS: { title: string; chars: string[] }[] = [
  { title: "a – z", chars: [..."abcdefghijklmnopqrstuvwxyz"] },
  { title: "A – Z", chars: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"] },
  { title: "0 – 9", chars: [..."0123456789"] },
  { title: "punctuation", chars: [".", ",", "!", "?", "'", '"', "-", ":", ";", "(", ")"] },
];
const ORDER = GROUPS.flatMap((g) => g.chars);
const NAMES: Record<string, string> = {
  ".": "period", ",": "comma", "!": "exclam", "?": "question", "'": "quotesingle",
  '"': "quotedbl", "-": "hyphen", ":": "colon", ";": "semicolon", "(": "parenleft", ")": "parenright",
};
const glyphName = (ch: string) => NAMES[ch] ?? (/[A-Za-z]/.test(ch) ? ch : "u" + ch.charCodeAt(0).toString(16));

const LS_KEY = "handwrite.strokes.v2";
const strokesByChar: Record<string, Stroke[]> = {};
try { Object.assign(strokesByChar, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch {}
const save = () => localStorage.setItem(LS_KEY, JSON.stringify(strokesByChar));

const STROKE_OPTS = { size: 46, thinning: 0.55, smoothing: 0.5, streamline: 0.5, simulatePressure: false };
function strokeOutline(points: Stroke): number[][] | null {
  if (points.length === 0) return null;
  const o = getStroke(points.map((p) => [p.x, p.y, p.pressure ?? 0.5]), STROKE_OPTS) as number[][];
  return o.length >= 2 ? o : null;
}

const $ = (id: string) => document.getElementById(id)!;
const cells = new Map<string, Cell>();

// Palm rejection + one-cell-at-a-time:
//  - once a real pen (Apple Pencil) is seen, ignore `touch` events for drawing
//    (the palm registers as touch) — so no screen protector needed.
//  - while a stroke is in progress in one cell, every other cell is locked, so a
//    palm landing on a neighbouring cell can't start a stray stroke.
let penSeen = false;
let lock: Cell | null = null;

class Cell {
  wrap: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  strokes: Stroke[];
  active: Stroke | null = null;

  constructor(public ch: string, parent: HTMLElement) {
    this.wrap = document.createElement("div");
    this.wrap.className = "cell";
    const label = document.createElement("span");
    label.className = "clabel";
    label.textContent = ch === " " ? "␣" : ch;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "pad";
    const clr = document.createElement("button");
    clr.className = "clr";
    clr.textContent = "✕";
    clr.addEventListener("click", () => this.clear());
    this.wrap.append(label, this.canvas, clr);
    parent.append(this.wrap);

    this.ctx = this.canvas.getContext("2d")!;
    this.strokes = (strokesByChar[ch] || []).map((s) => s.slice());

    const c = this.canvas;
    const allowed = (e: PointerEvent) => !(penSeen && e.pointerType !== "pen"); // palm rejection
    c.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "pen") penSeen = true;
      if (!allowed(e) || (lock && lock !== this)) return;
      e.preventDefault();
      lock = this;
      this.wrap.classList.add("active");
      c.setPointerCapture(e.pointerId);
      this.active = [this.pos(e)];
      this.redraw();
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.active || lock !== this || !allowed(e)) return;
      e.preventDefault();
      const evs = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
      for (const ev of evs) this.active!.push(this.pos(ev));
      this.redraw();
    });
    const end = (e: PointerEvent) => {
      if (!this.active) return;
      e.preventDefault();
      if (this.active.length > 1) this.strokes.push(this.active);
      this.active = null;
      if (lock === this) { lock = null; this.wrap.classList.remove("active"); }
      this.commit();
      this.redraw();
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", end);
    this.fit();
  }

  pos(e: PointerEvent): InputPoint {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VIRT, y: ((e.clientY - r.top) / r.height) * VIRT, pressure: e.pressure > 0 ? e.pressure : 0.5 };
  }

  fit() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    const s = (r.width * dpr) / VIRT;
    this.ctx.setTransform(s, 0, 0, s, 0, 0); // draw in 0..VIRT
    this.redraw();
  }

  redraw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIRT, VIRT);
    // guides (1px ≈ VIRT/displayWidth)
    const px = VIRT / Math.max(1, this.canvas.getBoundingClientRect().width);
    ctx.strokeStyle = "#d7def0";
    ctx.lineWidth = px;
    ctx.beginPath(); ctx.moveTo(0, 0.78 * VIRT); ctx.lineTo(VIRT, 0.78 * VIRT); ctx.stroke(); // baseline
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.beginPath(); ctx.moveTo(0, 0.45 * VIRT); ctx.lineTo(VIRT, 0.45 * VIRT); ctx.stroke(); // x-height
    ctx.setLineDash([]);
    ctx.fillStyle = this.strokes.length || this.active ? "#1d2347" : "#1d2347";
    for (const s of this.strokes) this.fillStroke(s);
    if (this.active) this.fillStroke(this.active);
  }
  fillStroke(s: Stroke) {
    const o = strokeOutline(s);
    if (!o) return;
    const p = new Path2D();
    o.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    this.ctx.fill(p);
  }

  commit() {
    if (this.strokes.length) strokesByChar[this.ch] = this.strokes.map((s) => s.slice());
    else delete strokesByChar[this.ch];
    save();
    updateCount();
  }
  clear() { this.strokes = []; this.active = null; this.commit(); this.redraw(); }
}

function updateCount() {
  const n = ORDER.filter((c) => strokesByChar[c]?.length).length;
  $("count").textContent = `${n} / ${ORDER.length} captured`;
}

// ---- build the grid --------------------------------------------------------
const grid = $("grid");
for (const group of GROUPS) {
  const h = document.createElement("div");
  h.className = "group";
  h.textContent = group.title;
  grid.append(h);
  for (const ch of group.chars) cells.set(ch, new Cell(ch, grid));
}
(globalThis as any).__cells = cells; // test hook
updateCount();

// ---- export / build --------------------------------------------------------
function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("json").addEventListener("click", () => download("handwriting-strokes.json", new Blob([JSON.stringify(strokesByChar)], { type: "application/json" })));
$("build").addEventListener("click", () => {
  const cell = { width: VIRT, height: VIRT };
  const fm = { unitsPerEm: DEFAULT_METRICS.unitsPerEm, baseline: DEFAULT_METRICS.baseline, capHeight: DEFAULT_METRICS.capHeight };
  const glyphs: GlyphDef[] = [];
  for (const ch of ORDER) {
    const s = strokesByChar[ch];
    if (!s?.length) continue;
    const outline = strokesToGlyphOutline(s, cell, fm, { ...STROKE_OPTS, curveFit: true, fitEpsilon: 8 });
    if (!outline.length) continue;
    const m = applyBearings(outline, { sideBearing: 70 });
    glyphs.push({ char: ch, codepoint: ch.charCodeAt(0), name: glyphName(ch), advanceWidth: m.advanceWidth, alternates: [m.outline] });
  }
  if (!glyphs.length) { alert("Draw at least one character first."); return; }
  const font = buildFont({ familyName: "My Handwriting", styleName: "Regular", ...DEFAULT_METRICS, glyphs });
  download("MyHandwriting.otf", new Blob([fontToUint8Array(font) as unknown as BlobPart], { type: "font/otf" }));
  $("count").textContent = `built ${glyphs.length} glyphs ✓`;
});
$("import").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  file.text().then((t) => {
    try {
      Object.assign(strokesByChar, JSON.parse(t));
      save();
      for (const [ch, cell] of cells) { cell.strokes = (strokesByChar[ch] || []).map((s) => s.slice()); cell.redraw(); }
      updateCount();
    } catch { alert("bad json"); }
  });
});

let raf = 0;
window.addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => cells.forEach((c) => c.fit())); });

// Block Safari pinch-zoom (the viewport meta is ignored on iOS for a11y reasons).
for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(t, (e) => e.preventDefault());
