<script lang="ts">
  import { getStroke } from "perfect-freehand";
  import { modal } from "$lib/actions/modal";
  import { canvasInk } from "$lib/theme.svelte";
  import { cap, save, penOptions, DEFAULT_PEN, type Pen } from "$lib/capture.svelte";

  let { onClose }: { onClose: () => void } = $props();

  // Nib presets. "Calligraphy" leans hard on pressure (high thinning) so down /
  // cross strokes vary in weight from the Pencil's pressure.
  const PRESETS: { name: string; pen: Pen }[] = [
    { name: "Fine", pen: { size: 18, thinning: 0.5 } },
    { name: "Medium", pen: { size: 30, thinning: 0.6 } },
    { name: "Bold", pen: { size: 46, thinning: 0.5 } },
    { name: "Calligraphy", pen: { size: 40, thinning: 0.95 } },
  ];
  const isPreset = (p: { size: number; thinning: number }) =>
    cap.pen.size === p.size && cap.pen.thinning === p.thinning;

  function setPen(next: Partial<Pen>) {
    cap.pen = { ...cap.pen, ...next };
    save();
  }

  // live sample stroke (an S-curve with a pressure ramp so thick/thin shows)
  let canvas: HTMLCanvasElement | undefined = $state();
  const W = 320,
    H = 90;
  const sample = (() => {
    const pts: [number, number, number][] = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = 24 + t * (W - 48);
      const y = H / 2 + Math.sin(t * Math.PI * 2) * (H * 0.28);
      const pressure = 0.35 + 0.6 * Math.sin(t * Math.PI); // light → heavy → light
      pts.push([x, y, pressure]);
    }
    return pts;
  })();

  function drawSample() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // pen size is authored in a 1000-unit em; scale it to this little sample box
    const o = getStroke(sample, {
      ...penOptions(),
      size: cap.pen.size * (H / 220) * 2.2,
    }) as number[][];
    if (o.length < 2) return;
    const p = new Path2D();
    o.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    ctx.fillStyle = canvasInk().ink;
    ctx.fill(p);
  }
  $effect(() => {
    cap.pen.size;
    cap.pen.thinning;
    drawSample();
  });
</script>

<div class="backdrop" role="presentation" onclick={onClose}>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label="Pen"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === "Escape" && onClose()}
    tabindex="-1"
    use:modal
  >
    <header class="sheet-head">
      <span class="title">Pen</span>
      <button class="close" onclick={onClose} aria-label="Close">✕</button>
    </header>

    <canvas class="sample" bind:this={canvas} style="width:{W}px;height:{H}px" aria-hidden="true"
    ></canvas>

    <div class="presets">
      {#each PRESETS as pr (pr.name)}
        <button class="chip" class:on={isPreset(pr.pen)} onclick={() => setPen(pr.pen)}
          >{pr.name}</button
        >
      {/each}
    </div>

    <label class="slider">
      <span class="srow"><span>Thickness</span><span class="val">{cap.pen.size}</span></span>
      <input
        type="range"
        min="12"
        max="64"
        step="2"
        value={cap.pen.size}
        oninput={(e) => setPen({ size: +e.currentTarget.value })}
      />
    </label>

    <label class="slider">
      <span class="srow"
        ><span>Pressure response</span><span class="val">{Math.round(cap.pen.thinning * 100)}%</span
        ></span
      >
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={cap.pen.thinning}
        oninput={(e) => setPen({ thinning: +e.currentTarget.value })}
      />
    </label>

    <footer class="sheet-foot">
      <span class="note">Higher pressure response = more weight from how hard you press.</span>
      <button class="link" onclick={() => setPen({ ...DEFAULT_PEN })}>Reset</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 15;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    padding: calc(8px + env(safe-area-inset-top)) clamp(8px, 3vw, 24px);
    background: color-mix(in oklch, var(--night) 30%, transparent);
    backdrop-filter: blur(2px);
  }
  .sheet {
    width: min(22rem, 100%);
    background: var(--paper-deep);
    border: 1px solid var(--rule);
    border-radius: 13px;
    padding: 14px;
    box-shadow: 0 18px 50px oklch(30% 0.085 278 / 0.28);
  }
  .sheet:focus-visible {
    outline: none;
  }
  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .title {
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--ink);
  }
  button {
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    cursor: pointer;
  }
  .close {
    border: 1px solid var(--rule);
    background: var(--paper);
    color: var(--ink);
    border-radius: 9px;
    min-width: 36px;
    min-height: 36px;
    font-weight: 600;
  }
  .close:hover {
    border-color: var(--indigo);
    color: var(--indigo);
  }
  .sample {
    display: block;
    width: 100%;
    background: var(--canvas-bg);
    border: 1px solid var(--rule);
    border-radius: 11px;
    margin-bottom: 12px;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }
  .chip {
    border: 1px solid var(--rule);
    background: var(--paper);
    color: var(--ink);
    border-radius: 999px;
    padding: 8px 14px;
    font-weight: 600;
    font-size: 0.85rem;
    min-height: 40px;
    transition:
      border-color 0.2s,
      color 0.2s,
      background 0.2s;
  }
  .chip:hover {
    border-color: var(--indigo);
    color: var(--indigo);
  }
  .chip.on {
    background: var(--indigo);
    border-color: var(--indigo);
    color: var(--paper);
  }
  .slider {
    display: block;
    margin-bottom: 14px;
  }
  .srow {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--ink);
    margin-bottom: 6px;
  }
  .val {
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  input[type="range"] {
    width: 100%;
    accent-color: var(--indigo);
    height: 28px;
  }
  .sheet-foot {
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid var(--rule);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .note {
    font-size: 0.76rem;
    color: var(--ink-soft);
    line-height: 1.3;
  }
  .link {
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 0.82rem;
    text-decoration: underline;
    text-underline-offset: 3px;
    flex: none;
  }
  .link:hover {
    color: var(--indigo);
  }
  @media (max-width: 640px) {
    .backdrop {
      align-items: flex-end;
      justify-content: stretch;
      padding: 0;
    }
    .sheet {
      width: 100%;
      border-radius: 13px 13px 0 0;
      padding-bottom: calc(14px + env(safe-area-inset-bottom));
    }
  }
</style>
