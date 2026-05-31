<script lang="ts">
  import { VIRT, BASELINE_FRAC, XHEIGHT_FRAC, CAP_FRAC } from "$lib/handwrite/capture/space";
  import { strokePath as path } from "$lib/handwrite/capture/stroke-path";
  import { cap, ui, getStrokes, setStrokes, onionStrokes, type Stroke, type Pt } from "$lib/capture.svelte";

  let { char }: { char: string } = $props();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let active: Stroke | null = null; // in-progress stroke (imperative)
  let activeId: number | null = null; // pointer that owns the active stroke

  // Single source of truth: committed strokes come straight from the store, so
  // the ✕ button and "done" styling react the instant a stroke is saved.
  const committed = $derived(getStrokes(char));
  const onion = $derived(onionStrokes(char));

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
    ctx.strokeStyle = "#cdd2ee";
    ctx.lineWidth = px;
    ctx.beginPath(); ctx.moveTo(0, BASELINE_FRAC * VIRT); ctx.lineTo(VIRT, BASELINE_FRAC * VIRT); ctx.stroke();
    ctx.setLineDash([4 * px, 4 * px]);
    for (const f of [XHEIGHT_FRAC, CAP_FRAC]) { ctx.beginPath(); ctx.moveTo(0, f * VIRT); ctx.lineTo(VIRT, f * VIRT); ctx.stroke(); }
    ctx.setLineDash([]);
    if (onion) { ctx.fillStyle = "#c1c8ea"; for (const s of onion) { const p = path(s); if (p) ctx.fill(p); } }
    ctx.fillStyle = "#1b1f3b";
    for (const s of committed) { const p = path(s); if (p) ctx.fill(p); }
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
    if (active) return; // a stroke is already in progress — ignore a second (palm) pointer
    e.preventDefault();
    ui.activeChar = char;
    canvas.setPointerCapture(e.pointerId);
    activeId = e.pointerId;
    active = [pos(e)];
    redraw();
  }
  function move(e: PointerEvent) {
    if (!active || e.pointerId !== activeId || ui.activeChar !== char || !allowed(e)) return;
    e.preventDefault();
    const evs = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
    for (const ev of evs) active.push(pos(ev));
    redraw();
  }
  function end(e: PointerEvent) {
    if (!active || e.pointerId !== activeId) return;
    e.preventDefault();
    if (active.length > 1) setStrokes(char, [...committed, active]); // -> store -> `committed` derived updates
    active = null;
    activeId = null;
    if (ui.activeChar === char) ui.activeChar = null;
    redraw();
  }
  function clear() {
    active = null;
    setStrokes(char, []);
    redraw();
  }

  // reset the in-progress stroke when the pass changes / data is imported
  $effect(() => { cap.activePass; ui.importTick; active = null; activeId = null; });
  // redraw whenever committed strokes or the onion-skin change
  $effect(() => { committed; onion; cap.pen.size; cap.pen.thinning; redraw(); });
  // size to the element
  $effect(() => {
    fit();
    const ro = new ResizeObserver(() => fit());
    if (canvas) ro.observe(canvas);
    return () => ro.disconnect();
  });
</script>

<div class="cell" class:active={ui.activeChar === char} class:done={committed.length > 0}>
  <span class="lbl">{char}</span>
  <canvas
    bind:this={canvas}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={end}
    onpointerleave={end}
  ></canvas>
  {#if committed.length}<button class="clr" onclick={clear} aria-label="clear">✕</button>{/if}
</div>

<style>
  .cell {
    position: relative; aspect-ratio: 1/1; background: #fff;
    border: 1px solid var(--rule, oklch(47% 0.15 277 / 0.24));
    border-radius: 13px; overflow: hidden;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .cell.active {
    border-color: var(--indigo, oklch(47% 0.15 277));
    box-shadow: 0 0 0 2px var(--indigo, oklch(47% 0.15 277));
  }
  .cell.done { background: var(--paper-deep, oklch(95.4% 0.011 92)); }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; }
  .lbl {
    position: absolute; top: 4px; left: 8px; font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-size: 0.82rem; font-weight: 700; color: var(--indigo, oklch(47% 0.15 277)); opacity: 0.45; pointer-events: none;
  }
  .clr {
    position: absolute; top: 3px; right: 3px; padding: 2px 6px; font-size: 0.72rem; line-height: 1;
    border: none; background: transparent; color: var(--ink-soft, oklch(43% 0.04 272)); opacity: 0.6; cursor: pointer;
    transition: color 0.2s, opacity 0.2s;
  }
  .clr:hover { color: var(--indigo, oklch(47% 0.15 277)); opacity: 1; }
  .clr:active { color: var(--indigo, oklch(47% 0.15 277)); opacity: 1; }
</style>
