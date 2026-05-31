<script lang="ts">
  import { onMount } from "svelte";
  import Cell from "$lib/components/Cell.svelte";
  import SentenceCanvas from "$lib/components/SentenceCanvas.svelte";
  import BottomNav from "$lib/components/BottomNav.svelte";
  import TopBar from "$lib/components/TopBar.svelte";
  import ProfileSheet from "$lib/components/ProfileSheet.svelte";
  import PenSheet from "$lib/components/PenSheet.svelte";
  import FirstRunOverlay from "$lib/components/FirstRunOverlay.svelte";
  import { CHAR_GROUPS } from "$lib/handwrite/charsets";
  import { cap, load, save, newPass, toggleGroup, doneInPass, chars } from "$lib/capture.svelte";

  const SEEN_KEY = "handwrite.seen.v1";

  const groups = $derived(CHAR_GROUPS.filter((g) => cap.enabled.includes(g.id)));
  const extraGroups = $derived(groups.filter((g) => g.id !== "lower"));
  const lowerGroup = $derived(CHAR_GROUPS.find((g) => g.id === "lower"));

  let showProfiles = $state(false);
  let showPen = $state(false);
  let showIntro = $state(false);
  let showMoreChars = $state(false);

  // Grid CTA: "Add another round" once the active round has at least one char drawn.
  const activeHasContent = $derived(
    !!cap.passes[cap.activePass] && Object.values(cap.passes[cap.activePass]).some((s) => s?.length),
  );

  function dismissIntro() {
    showIntro = false;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  }
  function reopenIntro() {
    try {
      localStorage.removeItem(SEEN_KEY);
    } catch {}
    showIntro = true;
  }

  onMount(() => {
    load();
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") showIntro = true;
    } catch {}
    // Ask the browser to keep our local strokes from being evicted under storage
    // pressure / privacy timers (best-effort; not all browsers honour it).
    navigator.storage?.persist?.();
    const block = (e: Event) => e.preventDefault();
    const flush = () => save(); // belt-and-braces save when the page is hidden/closed
    for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(t, block);
    for (const t of ["visibilitychange", "pagehide"]) window.addEventListener(t, flush);
    return () => {
      for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.removeEventListener(t, block);
      for (const t of ["visibilitychange", "pagehide"]) window.removeEventListener(t, flush);
    };
  });
</script>

<TopBar onOpenProfiles={() => (showProfiles = true)} onOpenPen={() => (showPen = true)} />

<!-- Both views stay mounted; we just hide the inactive one. That preserves the
     sentence canvas's in-progress drawing when you pop over to Grid and back. -->
<div hidden={cap.mode !== "sentence"}>
  <SentenceCanvas />
</div>

<div hidden={cap.mode !== "grid"}>
  <main>
    {#if lowerGroup}
      <div class="group">{lowerGroup.label}</div>
      {#each lowerGroup.chars as ch (ch.char)}
        <Cell char={ch.char} />
      {/each}
    {/if}

    <div class="disclosure">
      <button class="disc-btn" onclick={() => (showMoreChars = !showMoreChars)} aria-expanded={showMoreChars}>
        {showMoreChars ? "▾" : "▸"} Add more characters
      </button>
      {#if showMoreChars}
        <div class="chips">
          <!-- lowercase is always-on (rendered above unconditionally), so it is
               not offered as a toggle here — its chip state could otherwise
               disagree with the always-visible lowercase cells. -->
          {#each CHAR_GROUPS.filter((g) => g.id !== "lower") as g (g.id)}
            <button class="chip" class:on={cap.enabled.includes(g.id)} onclick={() => toggleGroup(g.id)}>{g.label}</button>
          {/each}
        </div>
      {/if}
    </div>

    {#if showMoreChars}
      {#each extraGroups as g (g.id)}
        <div class="group">{g.label}</div>
        {#each g.chars as ch (ch.char)}
          <Cell char={ch.char} />
        {/each}
      {/each}
    {/if}
  </main>

  {#if activeHasContent}
    <div class="cta-row">
      <button class="primary" onclick={newPass}>Add another round</button>
    </div>
  {/if}
</div>

<BottomNav />

{#if showProfiles}
  <ProfileSheet onClose={() => (showProfiles = false)} onShowIntro={reopenIntro} />
{/if}

{#if showPen}
  <PenSheet onClose={() => (showPen = false)} />
{/if}

{#if showIntro}
  <FirstRunOverlay onDismiss={dismissIntro} />
{/if}

<style>
  :global(:root) {
    --paper: oklch(97.6% 0.008 95);
    --paper-deep: oklch(95.4% 0.011 92);
    --ink: oklch(25% 0.045 270);
    --ink-soft: oklch(43% 0.04 272);
    --indigo: oklch(47% 0.15 277);
    --indigo-bright: oklch(60% 0.17 280);
    --rule: oklch(47% 0.15 277 / 0.24);
    --night: oklch(30% 0.085 278);
    /* legacy aliases used by the canvas components' CSS */
    --accent: var(--indigo);
    --line: var(--rule);
    --muted: var(--ink-soft);
  }
  :global(html, body) {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-optical-sizing: auto;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    touch-action: pan-y;
    -webkit-text-size-adjust: 100%;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    overscroll-behavior-y: contain;
  }
  button {
    font: inherit;
    font-weight: 600;
    font-size: 0.88rem;
    border: 1px solid var(--rule);
    background: var(--paper-deep);
    color: var(--ink);
    padding: 8px 12px;
    border-radius: 11px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  button:not(:disabled):hover {
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
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .chip {
    font-size: 0.78rem;
    padding: 5px 12px;
    border-radius: 999px;
    color: var(--ink-soft);
  }
  .chip:not(:disabled):hover {
    transform: none;
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
  main {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
    gap: 12px;
    padding: 14px clamp(14px, 4vw, 28px) 84px;
    align-items: start;
  }
  .group {
    grid-column: 1 / -1;
    color: var(--indigo);
    font-size: 0.74rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin-top: 10px;
  }
  .group:first-child {
    margin-top: 0;
  }
  .disclosure {
    grid-column: 1 / -1;
    margin-top: 16px;
  }
  .disc-btn {
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .cta-row {
    position: sticky;
    bottom: 84px;
    z-index: 4;
    display: flex;
    justify-content: center;
    padding: 0 clamp(14px, 4vw, 28px) 12px;
    pointer-events: none;
  }
  .cta-row .primary {
    pointer-events: auto;
    font-size: 1rem;
    padding: 13px 26px;
    border-radius: 13px;
    box-shadow: 0 8px 24px oklch(47% 0.15 277 / 0.3);
  }
</style>
