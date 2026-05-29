<script lang="ts">
  import { getStroke } from "perfect-freehand";
  import { VIRT, BASELINE_FRAC, XHEIGHT_FRAC, CAP_FRAC } from "$lib/handwrite/capture/space";
  import { assignStrokesToSegments, normalizeSegmentToCell } from "$lib/handwrite/capture/segment";
  import { PROMPTS, promptChars } from "$lib/handwrite/prompts";
  import { ui, applySentence, type Stroke, type Pt } from "$lib/capture.svelte";

  // ---- prompt selection ----
  let promptIdx = $state(0);
  let custom = $state("");
  let useCustom = $state(false);
  const target = $derived(useCustom ? promptChars(custom) : PROMPTS[promptIdx].chars);

  // ---- capture state ----
  let tool = $state<"write" | "divide">("write");
  let strokes = $state<Stroke[]>([]);
  let dividers = $state<number[]>([]); // x positions in virtual coords
  let active: Stroke | null = null; // in-progress stroke (imperative)
  let activeId: number | null = null; // pointer that owns the active stroke
  let drag: { idx: number; moved: boolean; created: boolean; id: number } | null = null;

  const G = { baselineY: BASELINE_FRAC * VIRT, xHeightY: XHEIGHT_FRAC * VIRT };
  const segments = $derived(assignStrokesToSegments(strokes, dividers));
  const canApply = $derived(target.length > 0 && dividers.length + 1 === target.length);

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;

  const OPTS = { size: 46, thinning: 0.55, smoothing: 0.5, streamline: 0.5, simulatePressure: false };
  function path(s: Stroke): Path2D | null {
    if (s.length === 0) return null;
    const o = getStroke(s.map((p) => [p.x, p.y, p.pressure ?? 0.5]), OPTS) as number[][];
    if (o.length < 2) return null;
    const p = new Path2D();
    o.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  }

  /** virtual canvas width (height maps to VIRT; uniform scale keeps aspect). */
  function vWidth(): number {
    const r = canvas?.getBoundingClientRect();
    return r && r.height ? (r.width / r.height) * VIRT : VIRT;
  }

  function fit() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    if (!r.height) return;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx = canvas.getContext("2d");
    const s = (r.height * dpr) / VIRT;
    ctx?.setTransform(s, 0, 0, s, 0, 0);
    redraw();
  }

  function redraw() {
    if (!ctx || !canvas) return;
    const r = canvas.getBoundingClientRect();
    const VW = vWidth();
    const px = VIRT / Math.max(1, r.height);
    ctx.clearRect(0, 0, VW, VIRT);

    // segment tint bands (alternating) between sorted divider boundaries
    const bounds = [0, ...[...dividers].sort((a, b) => a - b), VW];
    for (let k = 0; k < bounds.length - 1; k++) {
      const beyond = k >= target.length;
      ctx.fillStyle = beyond ? "rgba(220,80,80,0.10)" : k % 2 ? "rgba(59,63,158,0.05)" : "rgba(59,63,158,0.10)";
      ctx.fillRect(bounds[k], 0, bounds[k + 1] - bounds[k], VIRT);
      // target-char label near the top of each band (space tokens stay blank)
      const ch = target[k];
      if (ch && ch !== " ") {
        ctx.fillStyle = "#aeb6c9";
        ctx.font = `${0.16 * VIRT}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(ch, (bounds[k] + bounds[k + 1]) / 2, 12 * px);
      }
    }

    // guides
    ctx.strokeStyle = "#d7def0";
    ctx.lineWidth = px;
    ctx.beginPath(); ctx.moveTo(0, BASELINE_FRAC * VIRT); ctx.lineTo(VW, BASELINE_FRAC * VIRT); ctx.stroke();
    ctx.setLineDash([4 * px, 4 * px]);
    for (const f of [XHEIGHT_FRAC, CAP_FRAC]) { ctx.beginPath(); ctx.moveTo(0, f * VIRT); ctx.lineTo(VW, f * VIRT); ctx.stroke(); }
    ctx.setLineDash([]);

    // ink — strokes in a band beyond the target count are warned (red)
    for (let k = 0; k < segments.length; k++) {
      ctx.fillStyle = k >= target.length ? "#c0392b" : "#1d2347";
      for (const s of segments[k]) { const p = path(s); if (p) ctx.fill(p); }
    }
    if (active) { ctx.fillStyle = "#1d2347"; const p = path(active); if (p) ctx.fill(p); }

    // dividers (vertical lines with a small ✕ affordance at the top)
    ctx.strokeStyle = "#3b3f9e";
    ctx.lineWidth = 2 * px;
    ctx.fillStyle = "#3b3f9e";
    ctx.font = `${0.12 * VIRT}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const dx of dividers) {
      ctx.beginPath(); ctx.moveTo(dx, 0); ctx.lineTo(dx, VIRT); ctx.stroke();
      ctx.fillText("✕", dx, 0.07 * VIRT);
    }
  }

  function pos(e: PointerEvent): Pt {
    const r = canvas.getBoundingClientRect();
    const k = VIRT / r.height;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, pressure: e.pressure > 0 ? e.pressure : 0.5 };
  }
  const allowed = (e: PointerEvent) => !(ui.penSeen && e.pointerType !== "pen");

  // ---- write tool: pen draws strokes (mirrors Cell's pointer pattern) ----
  function down(e: PointerEvent) {
    if (e.pointerType === "pen") ui.penSeen = true;
    if (!allowed(e)) return;
    if (tool === "divide") return divideDown(e);
    if (active) return; // a stroke is already in progress — ignore a second (palm) pointer
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    activeId = e.pointerId;
    active = [pos(e)];
    redraw();
  }
  function move(e: PointerEvent) {
    if (tool === "divide") return divideMove(e);
    if (!active || e.pointerId !== activeId || !allowed(e)) return; // only the owning pointer extends it
    e.preventDefault();
    const evs = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
    for (const ev of evs) active.push(pos(ev));
    redraw();
  }
  function end(e: PointerEvent) {
    if (tool === "divide") return divideUp(e);
    if (!active || e.pointerId !== activeId) return;
    e.preventDefault();
    if (active.length > 1) strokes = [...strokes, active];
    active = null;
    activeId = null;
    redraw();
  }

  // ---- divide tool: tap to drop, drag to adjust, tap a divider to remove ----
  const NEAR = 30; // virtual-unit hit radius for grabbing/removing a divider
  function nearestDivider(vx: number): number {
    let best = -1, bestD = NEAR;
    dividers.forEach((dx, i) => { const d = Math.abs(dx - vx); if (d < bestD) { bestD = d; best = i; } });
    return best;
  }
  function divideDown(e: PointerEvent) {
    if (drag) return; // already adjusting a divider — ignore a second (palm) pointer
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const vx = pos(e).x;
    const i = nearestDivider(vx);
    if (i >= 0) drag = { idx: i, moved: false, created: false, id: e.pointerId };
    else { dividers = [...dividers, vx]; drag = { idx: dividers.length - 1, moved: false, created: true, id: e.pointerId }; }
    redraw();
  }
  function divideMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    const vx = pos(e).x;
    const arr = [...dividers];
    if (Math.abs(vx - arr[drag.idx]) > 8) drag.moved = true;
    arr[drag.idx] = vx;
    dividers = arr;
    redraw();
  }
  function divideUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    if (!drag.moved && !drag.created) dividers = dividers.filter((_, k) => k !== drag!.idx); // tap = remove
    drag = null;
    redraw();
  }

  function clearAll() {
    active = null;
    activeId = null;
    strokes = [];
    dividers = [];
    redraw();
  }
  function pickPrompt(i: number) {
    useCustom = false;
    promptIdx = i;
    clearAll();
  }
  function onCustom(e: Event) {
    custom = (e.target as HTMLInputElement).value;
    useCustom = custom.trim().length > 0;
  }
  function apply() {
    if (!canApply) return;
    const segs = segments.map((s) => normalizeSegmentToCell(s, G));
    applySentence(target, segs);
    if (!useCustom) promptIdx = (promptIdx + 1) % PROMPTS.length; // advance preset
    clearAll();
  }

  // redraw whenever inputs change
  $effect(() => { strokes; dividers; target; redraw(); });
  $effect(() => {
    fit();
    const ro = new ResizeObserver(() => fit());
    if (canvas) ro.observe(canvas);
    return () => ro.disconnect();
  });
</script>

<div class="prompts">
  {#each PROMPTS as pr, i (pr.id)}
    <button class="chip" class:on={!useCustom && promptIdx === i} onclick={() => pickPrompt(i)}>{pr.text}</button>
  {/each}
  <input class="custom" type="text" placeholder="custom phrase…" value={custom} oninput={onCustom} />
</div>

<div class="bar">
  <div class="tools">
    <button class:on={tool === "write"} onclick={() => (tool = "write")}>✎ write</button>
    <button class:on={tool === "divide"} onclick={() => (tool = "divide")}>| divide</button>
  </div>
  <span class="ref">{target.join(" ")}</span>
  <span class="spacer"></span>
  <span class="count" class:ok={canApply}>segments {dividers.length + 1} / need {target.length}</span>
  <button onclick={clearAll}>clear</button>
  <button class="primary" disabled={!canApply} onclick={apply}>Apply →</button>
</div>

<canvas
  bind:this={canvas}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={end}
  onpointercancel={end}
  onpointerleave={end}
></canvas>

<p class="hint">
  Write the phrase in <b>print</b> (lift the pen between letters). Then switch to <b>divide</b> and tap each gap —
  <b>including the space between words</b> — to drop a boundary (drag to nudge, tap a line to remove) until the
  counter matches. <b>Apply</b> stores each segment as that letter and moves to the next phrase.
</p>

<style>
  .prompts { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; padding: 10px 16px 0; }
  .chip {
    font: inherit; font-size: 0.78rem; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line);
    background: #fff; color: var(--muted); cursor: pointer; font-weight: 600;
  }
  .chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .custom { font: inherit; font-size: 0.8rem; padding: 5px 10px; border: 1px solid var(--line); border-radius: 8px; min-width: 140px; }
  .bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 16px; }
  .tools { display: flex; gap: 4px; }
  .tools button { font: inherit; font-weight: 600; font-size: 0.84rem; border: 1px solid var(--line); background: #fff; color: var(--ink); padding: 7px 12px; border-radius: 10px; cursor: pointer; }
  .tools button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .ref { font-size: 1.1rem; letter-spacing: 0.12em; color: #aeb6c9; font-weight: 600; }
  .spacer { flex: 1; }
  .count { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
  .count.ok { color: #2e7d32; font-weight: 700; }
  .bar button { font: inherit; font-weight: 600; font-size: 0.84rem; border: 1px solid var(--line); background: #fff; color: var(--ink); padding: 7px 12px; border-radius: 10px; cursor: pointer; }
  .bar button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .bar button:disabled { opacity: 0.4; }
  canvas {
    display: block; width: calc(100% - 28px); height: 240px; margin: 0 14px; background: #fff;
    border: 1px solid var(--line); border-radius: 12px; touch-action: none;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  }
  .hint { color: var(--muted); font-size: 0.78rem; max-width: 80ch; padding: 8px 16px 40px; }
</style>
