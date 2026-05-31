<script lang="ts">
  import { getStroke } from "perfect-freehand";
  import { VIRT, BASELINE_FRAC, XHEIGHT_FRAC, CAP_FRAC } from "$lib/handwrite/capture/space";
  import { assignStrokesToSegments, normalizeSegmentToCell, proposeDividers } from "$lib/handwrite/capture/segment";
  import { PROMPTS, promptChars } from "$lib/handwrite/prompts";
  import { ui, applySentence, newPass, cap, type Stroke, type Pt } from "$lib/capture.svelte";

  // ---- prompt selection ----
  let promptIdx = $state(0);
  let custom = $state("");
  let useCustom = $state(false);
  let showPhrases = $state(false);
  const target = $derived(useCustom ? promptChars(custom) : PROMPTS[promptIdx].chars);
  const phraseText = $derived(useCustom ? custom : PROMPTS[promptIdx].text);

  // ---- capture state ----
  let tool = $state<"write" | "divide" | "erase">("write");
  let strokes = $state<Stroke[]>([]);
  let dividers = $state<number[]>([]); // x positions in virtual coords
  let active: Stroke | null = null; // in-progress stroke (imperative)
  let activeId: number | null = null; // pointer that owns the active stroke
  let drag: { idx: number; moved: boolean; created: boolean; id: number } | null = null;
  let erasing = false; // erase tool pointer is down (scrub-to-erase)

  const G = { baselineY: BASELINE_FRAC * VIRT, xHeightY: XHEIGHT_FRAC * VIRT };
  const segments = $derived(assignStrokesToSegments(strokes, dividers));
  const canApply = $derived(target.length > 0 && dividers.length + 1 === target.length);

  // ---- progressive disclosure + plain-language counters ----
  const hasDrawn = $derived(strokes.length > 0);
  const neededLetters = $derived(target.filter((t) => t !== " ").length);
  const wordGaps = $derived(target.filter((t) => t === " ").length);
  // count target positions (non-space) whose assigned segment has at least one stroke
  const markedLetters = $derived(
    target.reduce((n, ch, i) => (ch !== " " && segments[i]?.length ? n + 1 : n), 0),
  );
  const allMarked = $derived(markedLetters === neededLetters && neededLetters > 0);
  // strokes whose centroid lands past the last target band (over-count warning,
  // mirrored here in text so it is not signalled by red colour alone)
  const extraStrokes = $derived(segments.slice(target.length).reduce((n, seg) => n + seg.length, 0));

  // Text alternative for the otherwise-silent drawing canvas + an aria-live
  // status so screen-reader users hear marking progress and the over-count warning.
  const canvasLabel = $derived(
    `Handwriting canvas (Apple Pencil only). ${
      hasDrawn ? `${markedLetters} of ${neededLetters} letters marked.` : "Empty — write the phrase here."
    }${extraStrokes > 0 ? ` ${extraStrokes} extra strokes beyond the phrase.` : ""}`,
  );
  const statusText = $derived(
    !hasDrawn
      ? ""
      : extraStrokes > 0
        ? `${markedLetters} of ${neededLetters} letters marked. ${extraStrokes} extra strokes beyond the phrase.`
        : allMarked
          ? `All ${neededLetters} letters marked.`
          : `${markedLetters} of ${neededLetters} letters marked.`,
  );
  // widen the writing area; ~70px per letter + 40px per word gap, min 900
  const canvasW = $derived(`${Math.max(900, neededLetters * 70 + wordGaps * 40)}px`);

  // ---- this round (active pass) already has content? ----
  const activeHasContent = $derived(
    !!cap.passes[cap.activePass] && Object.values(cap.passes[cap.activePass]).some((s) => s?.length),
  );

  // ---- morphing primary CTA ----
  type Cta = { label: string; action: () => void } | null;
  const cta = $derived.by((): Cta => {
    if (hasDrawn) {
      if (canApply) return { label: "Save this round", action: apply };
      return { label: "Mark the letters", action: markLetters };
    }
    if (activeHasContent) return { label: "Add another round", action: addRound };
    return null; // nothing drawn, empty round → rely on inline hint
  });

  function markLetters() {
    dividers = proposeDividers(strokes, target.length);
    tool = "divide";
    redraw();
  }
  function addRound() {
    newPass();
    clearAll();
  }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let scroller: HTMLDivElement | undefined = $state();
  let scrollable = $state(false);
  function checkScrollable() {
    if (scroller) scrollable = scroller.scrollWidth - scroller.clientWidth > 4;
  }

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
      ctx.fillStyle = beyond ? "rgba(220,80,80,0.10)" : k % 2 ? "rgba(74,56,170,0.05)" : "rgba(74,56,170,0.10)";
      ctx.fillRect(bounds[k], 0, bounds[k + 1] - bounds[k], VIRT);
      // target-char label near the top of each band (space tokens stay blank).
      // Don't label the single full-width band before any dividers exist — a lone
      // "t" floating in an empty canvas just reads as confusing.
      const ch = target[k];
      if (dividers.length > 0 && ch && ch !== " ") {
        ctx.fillStyle = "#9aa0c8";
        ctx.font = `${0.16 * VIRT}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(ch, (bounds[k] + bounds[k + 1]) / 2, 12 * px);
      }
    }

    // guides
    ctx.strokeStyle = "#cdd2ee";
    ctx.lineWidth = px;
    ctx.beginPath(); ctx.moveTo(0, BASELINE_FRAC * VIRT); ctx.lineTo(VW, BASELINE_FRAC * VIRT); ctx.stroke();
    ctx.setLineDash([4 * px, 4 * px]);
    for (const f of [XHEIGHT_FRAC, CAP_FRAC]) { ctx.beginPath(); ctx.moveTo(0, f * VIRT); ctx.lineTo(VW, f * VIRT); ctx.stroke(); }
    ctx.setLineDash([]);

    // ink — strokes in a band beyond the target count are warned (red)
    for (let k = 0; k < segments.length; k++) {
      ctx.fillStyle = k >= target.length ? "#c0392b" : "#1b1f3b";
      for (const s of segments[k]) { const p = path(s); if (p) ctx.fill(p); }
    }
    if (active) { ctx.fillStyle = "#1b1f3b"; const p = path(active); if (p) ctx.fill(p); }

    // dividers (vertical lines with a small ✕ affordance at the top)
    ctx.strokeStyle = "#4a38aa";
    ctx.lineWidth = 2 * px;
    ctx.fillStyle = "#4a38aa";
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
    if (tool === "erase") {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      erasing = true;
      eraseAt(pos(e));
      return;
    }
    if (active) return; // a stroke is already in progress — ignore a second (palm) pointer
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    activeId = e.pointerId;
    active = [pos(e)];
    redraw();
  }
  function move(e: PointerEvent) {
    if (tool === "divide") return divideMove(e);
    if (tool === "erase") {
      if (erasing && allowed(e)) { e.preventDefault(); eraseAt(pos(e)); } // scrub to keep erasing
      return;
    }
    if (!active || e.pointerId !== activeId || !allowed(e)) return; // only the owning pointer extends it
    e.preventDefault();
    const evs = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
    for (const ev of evs) active.push(pos(ev));
    redraw();
  }
  function end(e: PointerEvent) {
    if (tool === "divide") return divideUp(e);
    if (tool === "erase") { erasing = false; return; }
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

  // ---- erase tool: tap/scrub removes the nearest divider or stroke ----
  const ERASE_R = 60; // virtual-unit hit radius for grabbing a stroke
  function eraseAt(p: Pt) {
    const di = nearestDivider(p.x); // dividers win when tapped right on the line
    if (di >= 0) { dividers = dividers.filter((_, k) => k !== di); return; }
    let best = -1, bestD = ERASE_R;
    strokes.forEach((s, i) => {
      for (const q of s) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bestD) { bestD = d; best = i; } }
    });
    if (best >= 0) strokes = strokes.filter((_, k) => k !== best);
  }

  function clearAll() {
    active = null;
    activeId = null;
    erasing = false;
    strokes = [];
    dividers = [];
    redraw();
  }
  function pickPrompt(i: number) {
    useCustom = false;
    promptIdx = i;
    showPhrases = false;
    clearAll();
  }
  function onCustom(e: Event) {
    custom = (e.target as HTMLInputElement).value;
    useCustom = custom.trim().length > 0;
  }
  function commitCustom() {
    if (useCustom) {
      showPhrases = false;
      clearAll();
    }
  }
  function apply() {
    if (!canApply) return;
    const segs = segments.map((s) => normalizeSegmentToCell(s, G));
    applySentence(target, segs);
    // round model: keep the SAME phrase; clear the canvas and surface "Add another round".
    clearAll();
    tool = "write";
  }
  // redraw whenever inputs change
  $effect(() => { strokes; dividers; target; redraw(); });
  $effect(() => {
    fit();
    const ro = new ResizeObserver(() => { fit(); checkScrollable(); });
    if (canvas) ro.observe(canvas);
    return () => ro.disconnect();
  });
  // recompute the horizontal-scroll affordance when the required width changes
  $effect(() => { canvasW; checkScrollable(); });
</script>

<div class="phrase">
  {#if showPhrases}
    <div class="prompts">
      {#each PROMPTS as pr, i (pr.id)}
        <button class="chip" class:on={!useCustom && promptIdx === i} onclick={() => pickPrompt(i)}>{pr.text}</button>
      {/each}
      <input
        class="custom"
        type="text"
        placeholder="custom phrase…"
        value={custom}
        oninput={onCustom}
        onkeydown={(e) => e.key === "Enter" && commitCustom()}
        onblur={commitCustom}
      />
    </div>
  {:else}
    <span class="ref-line">{phraseText}</span>
    <button class="quiet" onclick={() => (showPhrases = true)}>Change phrase</button>
  {/if}
</div>

<div class="canvas-scroll" style="--canvas-w: {canvasW};" bind:this={scroller} onscroll={checkScrollable}>
  <canvas
    bind:this={canvas}
    aria-label={canvasLabel}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={end}
    onpointerleave={end}
  ></canvas>
</div>
{#if scrollable}
  <p class="scroll-cue"><span aria-hidden="true">↔</span> Scroll sideways to see the whole line</p>
{/if}

<div class="sr-only" aria-live="polite">{statusText}</div>

{#if hasDrawn}
  <div class="bar">
    <div class="tools">
      <button class:on={tool === "write"} onclick={() => (tool = "write")}>✎ write</button>
      <button class:on={tool === "divide"} onclick={() => (tool = "divide")}>| divide</button>
      <button class:on={tool === "erase"} onclick={() => (tool = "erase")}>⌫ erase</button>
    </div>
    <span class="spacer"></span>
    <span class="count" class:ok={allMarked && extraStrokes === 0} class:warn={extraStrokes > 0}>
      {#if extraStrokes > 0}
        {extraStrokes} extra {extraStrokes === 1 ? "stroke" : "strokes"} beyond the phrase
      {:else if allMarked}All {neededLetters} letters marked{:else}{markedLetters} of {neededLetters} letters marked{/if}
    </span>
    <button onclick={clearAll}>clear</button>
    {#if cta}
      <button class="primary" onclick={cta.action}>{cta.label}</button>
    {/if}
  </div>
{:else if cta}
  <div class="bar">
    <span class="spacer"></span>
    <button class="primary" onclick={cta.action}>{cta.label}</button>
  </div>
{/if}

<p class="hint">
  {#if !hasDrawn}
    Write the whole sentence in print — lift the Pencil between letters.
  {:else if !allMarked}
    Tap <b>Mark the letters</b> to auto-place dividers, then nudge any boundary with the <b>divide</b> tool until every
    letter is marked.
  {:else}
    Looks good — tap <b>Save this round</b> to store these letters, then add another round.
  {/if}
</p>

<style>
  .phrase { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; padding: 14px clamp(14px, 4vw, 28px) 4px; }
  .ref-line {
    font-family: "Shantell Sans", cursive; font-size: clamp(1.2rem, 3vw, 1.6rem); letter-spacing: 0.02em;
    color: var(--ink); font-weight: 500;
  }
  .quiet {
    font: inherit; font-family: "Bricolage Grotesque", system-ui, sans-serif; font-weight: 600; font-size: 0.82rem;
    background: none; border: none; color: var(--ink-soft); cursor: pointer; padding: 0 0 2px;
    border-bottom: 2px solid var(--rule); border-radius: 0; transition: color 0.2s, border-color 0.2s;
  }
  .quiet:hover { color: var(--indigo); border-color: var(--indigo); }
  .prompts { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; padding: 0; }
  .chip {
    font: inherit; font-family: "Bricolage Grotesque", system-ui, sans-serif; font-size: 0.78rem;
    padding: 5px 12px; border-radius: 999px; border: 1px solid var(--rule);
    background: var(--paper-deep); color: var(--ink-soft); cursor: pointer; font-weight: 600;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }
  .chip:hover { border-color: var(--indigo); color: var(--indigo); }
  .chip.on { background: var(--indigo); color: var(--paper); border-color: var(--indigo); }
  .chip.on:hover { background: var(--indigo-bright); border-color: var(--indigo-bright); color: var(--paper); }
  .custom {
    font: inherit; font-family: "Bricolage Grotesque", system-ui, sans-serif; font-size: 0.8rem;
    padding: 6px 11px; border: 1px solid var(--rule); border-radius: 11px; min-width: 140px;
    background: var(--paper-deep); color: var(--ink);
  }
  .custom::placeholder { color: var(--ink-soft); }
  .custom:focus-visible { outline-offset: 0; border-color: var(--indigo); box-shadow: 0 0 0 2px var(--indigo); }
  .bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px clamp(14px, 4vw, 28px); }
  .tools { display: flex; gap: 4px; }
  .tools button {
    font: inherit; font-family: "Bricolage Grotesque", system-ui, sans-serif; font-weight: 600; font-size: 0.84rem;
    border: 1px solid var(--rule); background: var(--paper-deep); color: var(--ink); padding: 11px 14px; min-height: 44px; border-radius: 11px; cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .tools button:hover { border-color: var(--indigo); color: var(--indigo); transform: translateY(-1px); }
  .tools button.on { background: var(--indigo); color: var(--paper); border-color: var(--indigo); }
  .tools button.on:hover { background: var(--indigo-bright); border-color: var(--indigo-bright); color: var(--paper); }
  .spacer { flex: 1; }
  .count { font-size: 0.85rem; color: var(--ink-soft); white-space: nowrap; }
  .count.ok { color: oklch(52% 0.13 150); font-weight: 700; }
  .count.warn { color: oklch(52% 0.18 25); font-weight: 700; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  .bar button {
    font: inherit; font-family: "Bricolage Grotesque", system-ui, sans-serif; font-weight: 600; font-size: 0.84rem;
    border: 1px solid var(--rule); background: var(--paper-deep); color: var(--ink); padding: 11px 14px; min-height: 44px; border-radius: 11px; cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .bar button:not(:disabled):hover { border-color: var(--indigo); color: var(--indigo); transform: translateY(-1px); }
  .bar button.primary { background: var(--indigo); color: var(--paper); border-color: var(--indigo); }
  .bar button.primary:not(:disabled):hover { background: var(--indigo-bright); border-color: var(--indigo-bright); color: var(--paper); }
  .bar button:disabled { opacity: 0.4; cursor: default; }
  .canvas-scroll {
    position: relative;
    overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;
    touch-action: pan-x; margin: 0 clamp(14px, 4vw, 28px);
  }
  canvas {
    display: block; width: max(100%, var(--canvas-w));
    height: clamp(260px, 44vh, 480px); background: #fff;
    border: 1px solid var(--rule); border-radius: 13px; touch-action: none;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
  }
  .scroll-cue {
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    color: var(--ink-soft); font-size: 0.76rem; font-weight: 600;
    padding: 4px clamp(14px, 4vw, 28px) 0; display: flex; align-items: center; gap: 5px;
  }
  .hint { color: var(--ink-soft); font-size: 0.82rem; line-height: 1.5; max-width: 80ch; padding: 10px clamp(14px, 4vw, 28px) 84px; }
  .hint b { color: var(--ink); font-weight: 700; }
</style>
