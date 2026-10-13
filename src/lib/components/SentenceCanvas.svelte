<script lang="ts">
  import { untrack } from "svelte";
  import { VIRT, BASELINE_FRAC, XHEIGHT_FRAC, CAP_FRAC } from "$lib/handwrite/capture/space";
  import { strokePath as path } from "$lib/handwrite/capture/stroke-path";
  import {
    assignStrokesToSegments,
    normalizeSegmentToCell,
    proposeDividers,
    strokeCentroidY,
  } from "$lib/handwrite/capture/segment";
  import { PROMPTS, promptChars, coverageRows } from "$lib/handwrite/prompts";
  import { canvasInk } from "$lib/theme.svelte";
  import {
    ui,
    applySentence,
    newPass,
    cap,
    chars,
    type Stroke,
    type Pt,
  } from "$lib/capture.svelte";

  // ---- prompt selection ----
  // The target is a list of LINES, each a list of tokens (chars; " " = word gap).
  // The default "full set" line-set is generated from the enabled groups, so it
  // grows as groups are toggled. Presets stay single-line; custom is multi-line.
  let promptIdx = $state(0);
  let custom = $state(""); // live textarea value (uncommitted)
  let committedCustom = $state(""); // rows only follow the committed value
  let useFullSet = $state(true);
  let showPhrases = $state(false);
  const useCustom = $derived(committedCustom.trim().length > 0);
  const rows = $derived.by(() => {
    if (useCustom) {
      const r = committedCustom
        .split(/\n+/)
        .map(promptChars)
        .filter((line) => line.length > 0);
      if (r.length) return r;
    }
    return useFullSet ? coverageRows(chars()) : [PROMPTS[promptIdx].chars];
  });
  const phraseText = $derived(rows.map((line) => line.join("")).join("\n"));

  // ---- capture state ----
  // Only strokes are state. The letter boundaries are NOT editable state — they
  // are re-derived from the ink on every change (see rowDividers), so there is
  // nothing for the user to manually break. You write; you erase a stroke; the
  // split follows automatically.
  let tool = $state<"write" | "erase">("write");
  let strokes = $state<Stroke[]>([]); // flat, in global virtual coords (y spans all rows)
  let active: Stroke | null = null; // in-progress stroke (imperative)
  let activeId: number | null = null; // pointer that owns the active stroke
  let erasing = false; // erase tool pointer is down (scrub-to-erase)

  /** Total virtual height — one VIRT-tall band stacked per row. */
  const VH = $derived(rows.length * VIRT);
  /** Per-row guide lines (offset into the stacked virtual space). */
  const G = (r: number) => ({
    baselineY: r * VIRT + BASELINE_FRAC * VIRT,
    xHeightY: r * VIRT + XHEIGHT_FRAC * VIRT,
  });
  const rowOf = (y: number) => Math.max(0, Math.min(rows.length - 1, Math.floor(y / VIRT)));
  /** strokes bucketed by row (each stroke's centroid decides) — computed once per ink change. */
  const rowStrokes = $derived.by(() => {
    const buckets: Stroke[][] = rows.map(() => []);
    for (const s of strokes) buckets[rowOf(strokeCentroidY(s))].push(s);
    return buckets;
  });
  // letter boundaries, re-derived live from the ink — one proposal per row
  const rowDividers = $derived(rows.map((line, r) => proposeDividers(rowStrokes[r], line)));
  // strokes bucketed into each row's bands (segmentation is horizontal-only)
  const rowSegments = $derived(
    rows.map((_, r) => assignStrokesToSegments(rowStrokes[r], rowDividers[r])),
  );

  // ---- progressive disclosure + plain-language counters ----
  const hasDrawn = $derived(strokes.length > 0);

  // The paragraph is ONE ordered sequence of letters; the line breaks are only a
  // writing convenience. We zip the written clusters (non-empty bands, read
  // top→bottom then left→right) onto this flat sequence, so it doesn't matter how
  // the letters are spread across the baselines — letter i is target letter i.
  const targetLetters = $derived(rows.flat().filter((t) => t !== " "));
  const neededLetters = $derived(targetLetters.length);

  /**
   * Walk every band in reading order and map each WRITTEN one to the next target
   * letter; empty bands (word gaps / spare dividers) are skipped. Yields per-band
   * labels + over-flags for drawing, the total count of written clusters, and
   * `picks` — the (row, band, letter) triples apply() saves, so the canvas can
   * never label a cluster differently from what Save stores.
   */
  const mapping = $derived.by(() => {
    const label: (string | null)[][] = [];
    const over: boolean[][] = [];
    const picks: { r: number; k: number; ch: string }[] = [];
    let li = 0; // next index into targetLetters
    for (let r = 0; r < rows.length; r++) {
      const segs = rowSegments[r];
      label[r] = [];
      over[r] = [];
      for (let k = 0; k < segs.length; k++) {
        if (segs[k].length) {
          const beyond = li >= targetLetters.length;
          const ch = beyond ? null : targetLetters[li];
          label[r][k] = ch;
          over[r][k] = beyond;
          if (ch) picks.push({ r, k, ch });
          li++;
        } else {
          label[r][k] = null;
          over[r][k] = false;
        }
      }
    }
    return { label, over, picks, written: li };
  });
  const markedLetters = $derived(Math.min(mapping.written, neededLetters));
  const allMarked = $derived(mapping.written >= neededLetters && neededLetters > 0);
  // letters written past the end of the paragraph (over-count warning, mirrored in
  // text so it is not signalled by red colour alone)
  const extraLetters = $derived(Math.max(0, mapping.written - neededLetters));

  // Save as soon as ≥1 letter is marked and nothing spills past the paragraph.
  // This lets an incomplete paragraph save the letters captured so far — the
  // unwritten tail is simply skipped on apply.
  const canApply = $derived(markedLetters >= 1 && extraLetters === 0);

  // Text alternative for the otherwise-silent drawing canvas + an aria-live
  // status so screen-reader users hear marking progress and the over-count warning.
  const canvasLabel = $derived(
    `Handwriting canvas (Apple Pencil only). ${
      hasDrawn
        ? `${markedLetters} of ${neededLetters} letters marked.`
        : "Empty — write the paragraph here."
    }${extraLetters > 0 ? ` ${extraLetters} extra letters beyond the paragraph.` : ""}`,
  );
  const statusText = $derived(
    !hasDrawn
      ? ""
      : extraLetters > 0
        ? `${markedLetters} of ${neededLetters} letters marked. ${extraLetters} extra letters beyond the paragraph.`
        : allMarked
          ? `All ${neededLetters} letters marked.`
          : `${markedLetters} of ${neededLetters} letters marked.`,
  );

  // ---- this round (active pass) already has content? ----
  const activeHasContent = $derived(
    !!cap.passes[cap.activePass] &&
      Object.values(cap.passes[cap.activePass]).some((s) => s?.length),
  );

  function addRound() {
    newPass();
    clearAll();
  }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let root: HTMLDivElement | undefined = $state();
  let viewH = $state(0);

  /**
   * Size the Write view to exactly fill the gap between the top bar and the
   * fixed bottom nav, so the page never scrolls. A non-scrolling page is what
   * stops the writing surface from sliding under the Pencil (and means the
   * canvas can swallow every touch, including a resting palm).
   */
  function sizeView() {
    if (!root) return;
    const top = root.getBoundingClientRect().top;
    const navH = document.querySelector(".bottomnav")?.getBoundingClientRect().height ?? 64;
    viewH = Math.max(320, window.innerHeight - top - navH);
  }

  /** virtual canvas width (the full height maps to VH; uniform scale keeps aspect). */
  function vWidth(): number {
    const r = canvas?.getBoundingClientRect();
    return r && r.height ? (r.width / r.height) * VH : VIRT;
  }

  function fit() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    if (!r.height) return;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx = canvas.getContext("2d");
    redraw();
  }

  /** Draw one row's bands, guides, labels, ink and dividers at vertical offset r*VIRT. */
  function drawRow(r: number, VW: number, ink: ReturnType<typeof canvasInk>, px: number) {
    if (!ctx) return;
    const oy = r * VIRT;
    const divs = [...rowDividers[r]].sort((a, b) => a - b);
    const segs = rowSegments[r];
    const labels = mapping.label[r] ?? [];
    const overs = mapping.over[r] ?? [];

    // segment tint bands (alternating) between sorted divider boundaries
    const bounds = [0, ...divs, VW];
    for (let k = 0; k < bounds.length - 1; k++) {
      ctx.fillStyle = overs[k] ? ink.tintBeyond : k % 2 ? ink.tintOdd : ink.tintEven;
      ctx.fillRect(bounds[k], oy, bounds[k + 1] - bounds[k], VIRT);
      // label each WRITTEN band with the letter it maps to (computed from reading
      // order, not the band's position), so the labels track what you actually
      // wrote. Only shown once dividers exist; empty bands stay blank.
      const ch = labels[k];
      if (divs.length > 0 && ch) {
        ctx.fillStyle = ink.label;
        ctx.font = `${0.16 * VIRT}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(ch, (bounds[k] + bounds[k + 1]) / 2, oy + 12 * px);
      }
    }

    // guides
    ctx.strokeStyle = ink.guide;
    ctx.lineWidth = px;
    ctx.beginPath();
    ctx.moveTo(0, oy + BASELINE_FRAC * VIRT);
    ctx.lineTo(VW, oy + BASELINE_FRAC * VIRT);
    ctx.stroke();
    ctx.setLineDash([4 * px, 4 * px]);
    for (const f of [XHEIGHT_FRAC, CAP_FRAC]) {
      ctx.beginPath();
      ctx.moveTo(0, oy + f * VIRT);
      ctx.lineTo(VW, oy + f * VIRT);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // ink — strokes (stored in global coords); a cluster mapped past the end of
    // the paragraph is warned (red)
    for (let k = 0; k < segs.length; k++) {
      ctx.fillStyle = overs[k] ? ink.over : ink.ink;
      for (const s of segs[k]) {
        const p = path(s);
        if (p) ctx.fill(p);
      }
    }

    // letter boundaries — thin guide lines only (auto-derived; not interactive)
    ctx.strokeStyle = ink.divider;
    ctx.lineWidth = px;
    for (const dx of divs) {
      ctx.beginPath();
      ctx.moveTo(dx, oy);
      ctx.lineTo(dx, oy + VIRT);
      ctx.stroke();
    }
  }

  function redraw() {
    if (!ctx || !canvas) return;
    const r = canvas.getBoundingClientRect();
    if (!r.height) return;
    // the transform depends on VH (row count), which can change without the
    // canvas box resizing — recompute it here so it can never go stale
    const dpr = window.devicePixelRatio || 1;
    const s = (r.height * dpr) / VH;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const VW = vWidth();
    const ink = canvasInk();
    const px = VH / Math.max(1, r.height);
    ctx.clearRect(0, 0, VW, VH);
    for (let ri = 0; ri < rows.length; ri++) drawRow(ri, VW, ink, px);
    if (active) {
      ctx.fillStyle = ink.ink;
      const p = path(active);
      if (p) ctx.fill(p);
    }
    drawNextGhost(VW, ink);
  }

  /**
   * Faint ghost of the NEXT letter to write, placed just after the last letter on
   * the active row (wrapping to the next row when it runs out of width). This is
   * the "what's coming" cue — the band labels show what you've already written.
   */
  function drawNextGhost(VW: number, ink: ReturnType<typeof canvasInk>) {
    if (!ctx) return;
    const idx = mapping.written;
    if (idx >= targetLetters.length) return; // whole paragraph captured
    const ch = targetLetters[idx];

    const startX = 0.04 * VW;
    let gx = startX;
    let grow = 0;
    let r = rows.length - 1; // last row with any ink (if any)
    while (r >= 0 && !rowStrokes[r].length) r--;
    if (r >= 0) {
      let maxX = 0;
      for (const s of rowStrokes[r]) for (const p of s) if (p.x > maxX) maxX = p.x;
      gx = maxX + 0.3 * VIRT; // about one letter-advance past the last ink
      grow = r;
      if (gx > VW - 0.12 * VIRT && r < rows.length - 1) {
        gx = startX; // no room left on this row — prompt at the start of the next
        grow = r + 1;
      }
    }
    gx = Math.min(gx, VW - 0.3 * VIRT); // last row full — keep the cue on-canvas

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = ink.ink;
    ctx.font = `italic ${0.42 * VIRT}px "Shantell Sans", cursive`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(ch, gx, grow * VIRT + BASELINE_FRAC * VIRT);
    ctx.restore();
  }

  function pos(e: PointerEvent): Pt {
    const r = canvas.getBoundingClientRect();
    const k = VH / r.height;
    return {
      x: (e.clientX - r.left) * k,
      y: (e.clientY - r.top) * k,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  }
  const allowed = (e: PointerEvent) => !(ui.penSeen && e.pointerType !== "pen");

  // ---- write tool: pen draws strokes (mirrors Cell's pointer pattern) ----
  function down(e: PointerEvent) {
    if (e.pointerType === "pen") ui.penSeen = true;
    if (!allowed(e)) return;
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
    if (tool === "erase") {
      if (erasing && allowed(e)) {
        e.preventDefault();
        eraseAt(pos(e));
      } // scrub to keep erasing
      return;
    }
    if (!active || e.pointerId !== activeId || !allowed(e)) return; // only the owning pointer extends it
    e.preventDefault();
    const evs = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
    for (const ev of evs) active.push(pos(ev));
    redraw();
  }
  function end(e: PointerEvent) {
    if (tool === "erase") {
      erasing = false;
      return;
    }
    if (!active || e.pointerId !== activeId) return;
    e.preventDefault();
    if (active.length > 1) strokes = [...strokes, active]; // boundaries re-derive automatically
    active = null;
    activeId = null;
    redraw();
  }

  // ---- erase tool: tap/scrub removes the nearest stroke ----
  const ERASE_R = 60; // virtual-unit hit radius for grabbing a stroke
  function eraseAt(p: Pt) {
    let best = -1,
      bestD = ERASE_R;
    strokes.forEach((s, i) => {
      for (const q of s) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    });
    if (best >= 0) strokes = strokes.filter((_, k) => k !== best);
  }

  function clearAll() {
    active = null;
    activeId = null;
    erasing = false;
    strokes = [];
    redraw();
  }
  function pickFullSet() {
    custom = "";
    committedCustom = "";
    useFullSet = true;
    showPhrases = false;
    clearAll();
  }
  function pickPrompt(i: number) {
    custom = "";
    committedCustom = "";
    useFullSet = false;
    promptIdx = i;
    showPhrases = false;
    clearAll();
  }
  function onCustom(e: Event) {
    custom = (e.target as HTMLTextAreaElement).value;
  }
  // Committing (blur) is the only moment rows may change, and it always clears
  // the ink — existing clusters must never be re-zipped onto a different
  // paragraph, or Save would store them under the wrong letters.
  function commitCustom() {
    if (custom === committedCustom) return;
    committedCustom = custom;
    if (useCustom) showPhrases = false;
    clearAll();
  }
  function apply() {
    if (!canApply) return;
    // Store exactly what the labels show: mapping already zipped each written
    // cluster onto its target letter. Each cluster is normalized with ITS row's
    // baseline.
    applySentence(
      mapping.picks.map((p) => p.ch),
      mapping.picks.map((p) => normalizeSegmentToCell(rowSegments[p.r][p.k], G(p.r))),
    );
    // round model: keep the SAME paragraph; clear the canvas and surface "Add another round".
    clearAll();
    tool = "write";
  }
  // The ink only means something for the paragraph it was written under (see
  // commitCustom). The paragraph also changes behind our back — toggling a character
  // group on the Grid tab, or switching profile — so drop the draft then too.
  let draftPhrase: string | undefined;
  $effect(() => {
    const p = phraseText;
    if (draftPhrase !== undefined && p !== draftPhrase) untrack(clearAll);
    draftPhrase = p;
  });
  // redraw whenever inputs change (rowDividers/rowSegments/mapping all derive from these)
  $effect(() => {
    strokes;
    rows;
    cap.pen.size;
    cap.pen.thinning;
    redraw();
  });
  // re-measure + re-fit when the Write view is shown again (it stays
  // mounted-but-hidden while on the Grid tab, where it measures 0)
  $effect(() => {
    cap.mode;
    if (cap.mode === "sentence") queueMicrotask(() => sizeView());
  });
  // keep the view sized to the viewport; the canvas re-fits via its ResizeObserver
  $effect(() => {
    sizeView();
    const onResize = () => sizeView();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    const ro = new ResizeObserver(() => fit());
    if (canvas) ro.observe(canvas);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      ro.disconnect();
    };
  });
</script>

<div class="write" bind:this={root} style="height: {viewH}px">
  <div class="phrase">
    {#if showPhrases}
      <div class="prompts">
        <button class="chip" class:on={useFullSet && !useCustom} onclick={pickFullSet}
          >full set</button
        >
        {#each PROMPTS as pr, i (pr.id)}
          <button
            class="chip"
            class:on={!useCustom && !useFullSet && promptIdx === i}
            onclick={() => pickPrompt(i)}>{pr.text}</button
          >
        {/each}
        <textarea
          class="custom"
          rows="3"
          placeholder="custom paragraph — one line per row…"
          value={custom}
          oninput={onCustom}
          onblur={commitCustom}
        ></textarea>
      </div>
    {:else}
      <span class="ref-line">{phraseText}</span>
      <button class="quiet" onclick={() => (showPhrases = true)}>Change paragraph</button>
    {/if}
  </div>

  <div class="canvas-wrap">
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

  <div class="sr-only" aria-live="polite">{statusText}</div>

  {#if hasDrawn}
    <div class="bar">
      <div class="tools">
        <button class:on={tool === "write"} onclick={() => (tool = "write")}>✎ write</button>
        <button class:on={tool === "erase"} onclick={() => (tool = "erase")}>⌫ erase</button>
      </div>
      <span class="spacer"></span>
      <span class="count" class:ok={allMarked && extraLetters === 0} class:warn={extraLetters > 0}>
        {#if extraLetters > 0}
          {extraLetters} extra {extraLetters === 1 ? "letter" : "letters"} beyond the paragraph
        {:else if allMarked}All {neededLetters} letters marked{:else}{markedLetters} of {neededLetters}
          letters marked{/if}
      </span>
      <button onclick={clearAll}>clear</button>
      <button class="primary" disabled={!canApply} onclick={apply}>Save this round</button>
    </div>
  {:else if activeHasContent}
    <div class="bar">
      <span class="spacer"></span>
      <button class="primary" onclick={addRound}>Add another round</button>
    </div>
  {/if}

  <p class="hint">
    {#if !hasDrawn}
      Write the letters <b>in order</b>, in print — lift the Pencil between letters. Wrap to the
      next baseline whenever you like; you don't have to match the reference's line breaks.
    {:else if !allMarked}
      The faint letter shows what to write next; each finished band is labelled with the letter it
      became. Mis-split? Tap <b>erase</b> and rewrite that letter with a clearer gap.
      <b>Save this round</b> keeps the letters marked so far.
    {:else}
      Looks good — tap <b>Save this round</b> to store these letters, then add another round.
    {/if}
  </p>
</div>

<style>
  .phrase {
    display: flex;
    gap: 12px;
    align-items: baseline;
    flex-wrap: wrap;
    padding: 10px clamp(14px, 4vw, 28px) 4px;
  }
  .ref-line {
    font-family: "Shantell Sans", cursive;
    font-size: 1rem;
    letter-spacing: 0.02em;
    color: var(--ink-soft);
    font-weight: 500;
    white-space: pre-line; /* honour the per-line breaks in the paragraph */
    line-height: 1.25;
  }
  .quiet {
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.82rem;
    background: none;
    border: none;
    color: var(--ink-soft);
    cursor: pointer;
    padding: 0 0 2px;
    border-bottom: 2px solid var(--rule);
    border-radius: 0;
    transition:
      color 0.2s,
      border-color 0.2s;
  }
  .quiet:hover {
    color: var(--indigo);
    border-color: var(--indigo);
  }
  .prompts {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
    padding: 0;
  }
  .chip {
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-size: 0.78rem;
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid var(--rule);
    background: var(--paper-deep);
    color: var(--ink-soft);
    cursor: pointer;
    font-weight: 600;
    transition:
      background 0.2s,
      color 0.2s,
      border-color 0.2s;
  }
  .chip:hover {
    border-color: var(--indigo);
    color: var(--indigo);
  }
  .chip.on {
    background: var(--indigo);
    color: var(--paper);
    border-color: var(--indigo);
  }
  .chip.on:hover {
    background: var(--indigo-bright);
    border-color: var(--indigo-bright);
    color: var(--paper);
  }
  .custom {
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-size: 0.8rem;
    padding: 6px 11px;
    border: 1px solid var(--rule);
    border-radius: 11px;
    min-width: 240px;
    flex: 1 1 240px;
    resize: vertical;
    background: var(--paper-deep);
    color: var(--ink);
  }
  .custom::placeholder {
    color: var(--ink-soft);
  }
  .custom:focus-visible {
    outline-offset: 0;
    border-color: var(--indigo);
    box-shadow: 0 0 0 2px var(--indigo);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 12px clamp(14px, 4vw, 28px);
  }
  .tools {
    display: flex;
    gap: 4px;
  }
  .tools button {
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.84rem;
    border: 1px solid var(--rule);
    background: var(--paper-deep);
    color: var(--ink);
    padding: 11px 14px;
    min-height: 44px;
    border-radius: 11px;
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s,
      border-color 0.2s,
      transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .tools button:hover {
    border-color: var(--indigo);
    color: var(--indigo);
    transform: translateY(-1px);
  }
  .tools button.on {
    background: var(--indigo);
    color: var(--paper);
    border-color: var(--indigo);
  }
  .tools button.on:hover {
    background: var(--indigo-bright);
    border-color: var(--indigo-bright);
    color: var(--paper);
  }
  .spacer {
    flex: 1;
  }
  .count {
    font-size: 0.85rem;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .count.ok {
    color: oklch(52% 0.13 150);
    font-weight: 700;
  }
  .count.warn {
    color: oklch(52% 0.18 25);
    font-weight: 700;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  .bar button {
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.84rem;
    border: 1px solid var(--rule);
    background: var(--paper-deep);
    color: var(--ink);
    padding: 11px 14px;
    min-height: 44px;
    border-radius: 11px;
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s,
      border-color 0.2s,
      transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .bar button:not(:disabled):hover {
    border-color: var(--indigo);
    color: var(--indigo);
    transform: translateY(-1px);
  }
  .bar button.primary {
    background: var(--indigo);
    color: var(--paper);
    border-color: var(--indigo);
  }
  .bar button.primary:not(:disabled):hover {
    background: var(--indigo-bright);
    border-color: var(--indigo-bright);
    color: var(--paper);
  }
  .bar button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  /* The Write view fills the space between the top bar and the bottom nav and
     never scrolls — that is what keeps the writing surface from sliding under
     the Pencil (and lets the canvas itself swallow every touch). */
  .write {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .canvas-wrap {
    flex: 1;
    min-height: 0; /* allow the canvas to shrink to fit instead of forcing page scroll */
    margin: 0 clamp(14px, 4vw, 28px);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--canvas-bg);
    border: 1px solid var(--rule);
    border-radius: 13px;
    /* swallow ALL gestures (pen draws, palm/finger do nothing) — no scrolling */
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  .hint {
    color: var(--ink-soft);
    font-size: 0.8rem;
    line-height: 1.45;
    max-width: 80ch;
    padding: 8px clamp(14px, 4vw, 28px) 10px;
  }
  .hint b {
    color: var(--ink);
    font-weight: 700;
  }
</style>
