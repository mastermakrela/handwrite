<script lang="ts">
  import { getStroke } from "perfect-freehand";
  import { VIRT, BASELINE_FRAC, XHEIGHT_FRAC, CAP_FRAC } from "$lib/handwrite/capture/space";
  import { cap, ui, getStrokes, setStrokes, onionStrokes, type Stroke, type Pt } from "$lib/capture.svelte";

  let { char }: { char: string } = $props();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let local = $state<Stroke[]>([]);
  let active: Stroke | null = null;

  const OPTS = { size: 46, thinning: 0.55, smoothing: 0.5, streamline: 0.5, simulatePressure: false };
  const onion = $derived(onionStrokes(char));

  function path(s: Stroke): Path2D | null {
    if (s.length === 0) return null;
    const o = getStroke(s.map((p) => [p.x, p.y, p.pressure ?? 0.5]), OPTS) as number[][];
    if (o.length < 2) return null;
    const p = new Path2D();
    o.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  }

  function fit() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx = canvas.getContext("2d");
    const s = (r.width * dpr) / VIRT;
    ctx?.setTransform(s, 0, 0, s, 0, 0);
    redraw();
  }

  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, VIRT, VIRT);
    const px = VIRT / Math.max(1, canvas.getBoundingClientRect().width);
    // guides
    ctx.strokeStyle = "#d7def0";
    ctx.lineWidth = px;
    ctx.beginPath(); ctx.moveTo(0, BASELINE_FRAC * VIRT); ctx.lineTo(VIRT, BASELINE_FRAC * VIRT); ctx.stroke();
    ctx.setLineDash([4 * px, 4 * px]);
    for (const f of [XHEIGHT_FRAC, CAP_FRAC]) { ctx.beginPath(); ctx.moveTo(0, f * VIRT); ctx.lineTo(VIRT, f * VIRT); ctx.stroke(); }
    ctx.setLineDash([]);
    // onion skin (previous pass, faint) — trace over it
    if (onion) { ctx.fillStyle = "#c9d2e6"; for (const s of onion) { const p = path(s); if (p) ctx.fill(p); } }
    // current ink
    ctx.fillStyle = "#1d2347";
    for (const s of local) { const p = path(s); if (p) ctx.fill(p); }
    if (active) { const p = path(active); if (p) ctx.fill(p); }
  }

  function pos(e: PointerEvent): Pt {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VIRT, y: ((e.clientY - r.top) / r.height) * VIRT, pressure: e.pressure > 0 ? e.pressure : 0.5 };
  }
  const allowed = (e: PointerEvent) => !(ui.penSeen && e.pointerType !== "pen");

  function down(e: PointerEvent) {
    if (e.pointerType === "pen") ui.penSeen = true;
    if (!allowed(e) || (ui.activeChar && ui.activeChar !== char)) return;
    e.preventDefault();
    ui.activeChar = char;
    canvas.setPointerCapture(e.pointerId);
    active = [pos(e)];
    redraw();
  }
  function move(e: PointerEvent) {
    if (!active || ui.activeChar !== char || !allowed(e)) return;
    e.preventDefault();
    const evs = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
    for (const ev of evs) active.push(pos(ev));
    redraw();
  }
  function end(e: PointerEvent) {
    if (!active) return;
    e.preventDefault();
    if (active.length > 1) local = [...local, active];
    active = null;
    if (ui.activeChar === char) ui.activeChar = null;
    setStrokes(char, local);
    redraw();
  }
  function clear() {
    local = [];
    active = null;
    setStrokes(char, []);
    redraw();
  }

  // reload local strokes when the active pass changes or an import happens
  $effect(() => {
    cap.activePass;
    ui.importTick;
    local = getStrokes(char).map((s) => s.slice());
    active = null;
    redraw();
  });

  $effect(() => { onion; redraw(); });

  $effect(() => {
    fit();
    const ro = new ResizeObserver(() => fit());
    if (canvas) ro.observe(canvas);
    return () => ro.disconnect();
  });
</script>

<div class="cell" class:active={ui.activeChar === char} class:done={local.length > 0}>
  <span class="lbl">{char}</span>
  <canvas
    bind:this={canvas}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={end}
    onpointerleave={end}
  ></canvas>
  {#if local.length}<button class="clr" onclick={clear} aria-label="clear">✕</button>{/if}
</div>

<style>
  .cell {
    position: relative; aspect-ratio: 1/1; background: #fff; border: 1px solid var(--line, #e6e9f2);
    border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(24, 32, 58, 0.04);
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  }
  .cell.active { border-color: var(--accent, #3b3f9e); box-shadow: 0 0 0 2px var(--accent, #3b3f9e); }
  .cell.done { background: #fcfdff; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; }
  .lbl { position: absolute; top: 4px; left: 7px; font-size: 0.8rem; font-weight: 700; color: #aeb6c9; pointer-events: none; }
  .clr {
    position: absolute; top: 2px; right: 2px; padding: 2px 6px; font-size: 0.72rem; line-height: 1;
    border: none; background: transparent; color: #c3c9d6; cursor: pointer;
  }
  .clr:active { color: var(--accent, #3b3f9e); }
</style>
