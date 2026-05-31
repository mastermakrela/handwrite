<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import TopBar from "$lib/components/TopBar.svelte";
  import BottomNav from "$lib/components/BottomNav.svelte";
  import ProfileSheet from "$lib/components/ProfileSheet.svelte";
  import FirstRunOverlay from "$lib/components/FirstRunOverlay.svelte";
  import { CHAR_GROUPS } from "$lib/handwrite/charsets";
  import {
    cap, load, save, chars, importPasses, roundsDone, fontBuildOptions, DEFAULT_FONT,
  } from "$lib/capture.svelte";
  import {
    buildFontBytes, registerPreviewFace, disposePreviewFace, PREVIEW_FAMILY, type PreviewFace,
  } from "$lib/handwrite/font/preview-font";

  const SEEN_KEY = "handwrite.seen.v1";

  let showProfiles = $state(false);
  let showIntro = $state(false);
  let mounted = $state(false);

  const unlocked = $derived(roundsDone() >= 1);

  // built glyph names present in the font (to drive the alphabet block)
  let glyphChars = $state<Set<string>>(new Set());
  let building = $state(false);
  let prev: PreviewFace | null = null;

  let sampleText = $state("the quick brown fox");

  // signature that changes whenever stroke data changes (E.5)
  const sig = $derived(
    JSON.stringify(cap.passes.map((p) => Object.keys(p).sort())) +
      ":" + roundsDone() + ":" + cap.font.weight + ":" + cap.font.smoothing + ":" + cap.font.spacing + ":" + cap.pen.thinning,
  );

  let rebuildScheduled = false;
  async function rebuild() {
    if (typeof document === "undefined") return;
    building = true;
    try {
      const charDefs = chars();
      const { glyphs, bytes } = buildFontBytes(cap.passes, charDefs, { familyName: "My Handwriting", build: fontBuildOptions() });
      glyphChars = new Set(glyphs.map((g) => g.char));
      if (bytes.length) {
        prev = await registerPreviewFace(bytes, prev, PREVIEW_FAMILY);
      }
    } catch (e) {
      console.error("preview font build failed", e);
    } finally {
      building = false;
    }
  }
  function scheduleRebuild() {
    if (rebuildScheduled) return;
    rebuildScheduled = true;
    requestAnimationFrame(() => {
      rebuildScheduled = false;
      rebuild();
    });
  }

  // alphabet rows: only groups that actually have at least one drawn glyph
  const alphaRows = $derived(
    CHAR_GROUPS.map((g) => ({
      label: g.label,
      chars: g.chars.filter((c) => glyphChars.has(c.char)),
    })).filter((r) => r.chars.length),
  );

  function download(name: string, blob: Blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportOtf() {
    const { glyphs, bytes } = buildFontBytes(cap.passes, chars(), { familyName: "My Handwriting", build: fontBuildOptions() });
    if (!glyphs.length) return alert("Draw at least one character first.");
    download("MyHandwriting.otf", new Blob([bytes as unknown as BlobPart], { type: "font/otf" }));
  }
  function exportPasses() {
    download("handwriting-passes.json", new Blob([JSON.stringify(cap.passes)], { type: "application/json" }));
  }
  function setFont(next: Partial<{ weight: number; smoothing: number; spacing: number }>) {
    cap.font = { ...cap.font, ...next };
    save();
  }
  function onImport(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        const parsed = JSON.parse(t);
        importPasses(Array.isArray(parsed) ? parsed : [parsed]);
      } catch {
        alert("Could not read that file.");
      }
    });
  }

  function reopenIntro() {
    try {
      localStorage.removeItem(SEEN_KEY);
    } catch {}
    showIntro = true;
  }
  function dismissIntro() {
    showIntro = false;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  }

  onMount(() => {
    load();
    mounted = true;
    navigator.storage?.persist?.();
    const flush = () => save();
    for (const t of ["visibilitychange", "pagehide"]) window.addEventListener(t, flush);
    return () => {
      for (const t of ["visibilitychange", "pagehide"]) window.removeEventListener(t, flush);
    };
  });

  // rebuild whenever stroke data changes (after mount so the store is loaded)
  $effect(() => {
    sig;
    if (mounted && unlocked) scheduleRebuild();
  });

  onDestroy(() => disposePreviewFace(prev));
</script>

<TopBar mode="preview" onOpenProfiles={() => (showProfiles = true)} />

{#if mounted && !unlocked}
  <main class="empty">
    <div class="empty-card">
      <h2>Write at least one round first.</h2>
      <p>Your handwriting becomes a real font here once you've written the sentence at least once.</p>
      <button class="primary" onclick={() => goto("/app")}>Go to Write</button>
    </div>
  </main>
{:else}
  <main class="preview" style="font-family: '{PREVIEW_FAMILY}', 'Shantell Sans', cursive;">
    <div class="export-row">
      <button class="primary" onclick={exportOtf}>Download .otf</button>
      <button onclick={exportPasses}>Export rounds (.json)</button>
      <label class="btn">Import rounds<input type="file" accept="application/json" onchange={onImport} /></label>
      {#if building}<span class="status">Building your font…</span>{/if}
    </div>
    <p class="export-help">Your font updates automatically as you add rounds.</p>

    <section class="block tune">
      <span class="lbl">Fine-tune the font</span>
      <div class="tune-grid">
        <label class="t-slider">
          <span class="srow"><span>Weight</span><span class="val">{cap.font.weight}</span></span>
          <input type="range" min="14" max="64" step="2" value={cap.font.weight} oninput={(e) => setFont({ weight: +e.currentTarget.value })} />
        </label>
        <label class="t-slider">
          <span class="srow"><span>Roundness</span><span class="val">{Math.round(cap.font.smoothing * 100)}%</span></span>
          <input type="range" min="0" max="1" step="0.05" value={cap.font.smoothing} oninput={(e) => setFont({ smoothing: +e.currentTarget.value })} />
        </label>
        <label class="t-slider">
          <span class="srow"><span>Letter spacing</span><span class="val">{cap.font.spacing}</span></span>
          <input type="range" min="10" max="80" step="2" value={cap.font.spacing} oninput={(e) => setFont({ spacing: +e.currentTarget.value })} />
        </label>
      </div>
      <button class="reset" onclick={() => setFont({ ...DEFAULT_FONT })}>Reset to defaults</button>
    </section>

    <section class="block">
      <span class="lbl">Type anything</span>
      <input
        class="sample-input specimen"
        value={sampleText}
        oninput={(e) => (sampleText = e.currentTarget.value)}
        spellcheck="false"
        autocomplete="off"
      />
    </section>

    <section class="block">
      <span class="lbl">Pangram</span>
      <p class="pangram specimen lined">the quick brown fox jumps over the lazy dog</p>
    </section>

    <section class="block">
      <span class="lbl">Your letters so far</span>
      {#if alphaRows.length}
        <div class="alphabet">
          {#each alphaRows as row (row.label)}
            <span class="alpha-row specimen">{row.chars.map((c) => c.char).join(" ")}</span>
          {/each}
        </div>
      {:else}
        <p class="muted">Draw more rounds to fill these in.</p>
      {/if}
    </section>
  </main>
{/if}

<BottomNav />

{#if showProfiles}
  <ProfileSheet onClose={() => (showProfiles = false)} onShowIntro={reopenIntro} />
{/if}

{#if showIntro}
  <FirstRunOverlay onDismiss={dismissIntro} />
{/if}

<style>
  main {
    padding: 18px clamp(14px, 4vw, 28px) 100px;
    max-width: 1180px;
    margin: 0 auto;
  }
  .specimen {
    font-feature-settings: "calt" 1;
    font-family: inherit;
  }
  .empty {
    display: flex;
    justify-content: center;
    padding-top: 12vh;
  }
  .empty-card {
    max-width: 28rem;
    text-align: center;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 13px;
    padding: 32px;
  }
  .empty-card h2 {
    font-family: "Shantell Sans", cursive;
    color: var(--indigo);
    font-weight: 600;
    margin: 0 0 12px;
  }
  .empty-card p {
    color: var(--ink-soft);
    line-height: 1.5;
    margin: 0 0 22px;
  }
  button,
  label.btn {
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.88rem;
    border: 1px solid var(--rule);
    background: var(--paper-deep);
    color: var(--ink);
    padding: 10px 16px;
    border-radius: 11px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  button:not(:disabled):hover,
  label.btn:hover {
    border-color: var(--indigo);
    color: var(--indigo);
    transform: translateY(-1px);
  }
  button.primary {
    background: var(--indigo);
    color: var(--paper);
    border-color: var(--indigo);
  }
  button.primary:not(:disabled):hover {
    background: var(--indigo-bright);
    border-color: var(--indigo-bright);
    color: var(--paper);
  }
  label.btn input {
    display: none;
  }
  .export-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  .status {
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
  .export-help {
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    color: var(--ink-soft);
    font-size: 0.85rem;
    margin: 8px 0 24px;
  }
  .block {
    border-top: 1px solid var(--rule);
    padding: 22px 0;
  }
  .tune-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px 28px;
  }
  .t-slider {
    display: block;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
  }
  .t-slider .srow {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--ink);
    margin-bottom: 6px;
  }
  .t-slider .val {
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  .t-slider input[type="range"] {
    width: 100%;
    accent-color: var(--indigo);
    height: 28px;
  }
  .reset {
    margin-top: 14px;
    font-size: 0.82rem;
    padding: 8px 14px;
  }
  .lbl {
    display: block;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    color: var(--indigo);
    font-size: 0.74rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin-bottom: 12px;
  }
  .sample-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--rule);
    border-radius: 13px;
    background: var(--paper-deep);
    color: var(--ink);
    font-size: clamp(1.8rem, 6vw, 3rem);
    padding: 12px 16px;
    line-height: 1.3;
  }
  .sample-input:focus-visible {
    outline-offset: 0;
    border-color: var(--indigo);
    box-shadow: 0 0 0 2px var(--indigo);
  }
  .pangram {
    color: var(--ink);
    font-size: clamp(1.6rem, 6vw, 4rem);
    margin: 0;
    --period: 1.5em;
    word-spacing: 0.05em;
    line-height: 1.5;
  }
  .lined {
    background-image: linear-gradient(
      to bottom,
      transparent calc(var(--period) - 2px),
      var(--rule) calc(var(--period) - 2px)
    );
    background-size: 100% var(--period);
    background-position: 0 0.16em;
  }
  .alphabet {
    display: grid;
    gap: 0.4em;
  }
  .alpha-row {
    color: var(--ink);
    font-size: clamp(1.4rem, 4.6vw, 2.6rem);
    letter-spacing: 0.04em;
    word-break: break-word;
    line-height: 1.4;
  }
  .muted {
    color: var(--ink-soft);
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
  }
</style>
