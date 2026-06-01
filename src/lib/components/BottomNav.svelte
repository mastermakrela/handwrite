<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { cap, save, roundsDone } from "$lib/capture.svelte";

  const onPreview = $derived(page.url.pathname === "/app/preview");
  const previewUnlocked = $derived(roundsDone() >= 1);
  // the highlighted tab: a capture mode while on /app, or none while on Preview
  const activeMode = $derived(onPreview ? null : cap.mode);

  function goWrite() {
    cap.mode = "sentence";
    save();
    if (onPreview) goto("/app");
  }
  function goGrid() {
    cap.mode = "grid";
    save();
    if (onPreview) goto("/app");
  }
  function goPreview() {
    if (!previewUnlocked) return;
    goto("/app/preview");
  }
</script>

<nav class="bottomnav" aria-label="Views">
  <button
    class="navitem"
    class:on={activeMode === "sentence"}
    onclick={goWrite}
    aria-current={activeMode === "sentence" ? "page" : undefined}
  >
    <span class="glyph" aria-hidden="true">✎</span>
    <span class="label">Write</span>
  </button>
  <button
    class="navitem"
    class:on={activeMode === "grid"}
    onclick={goGrid}
    aria-current={activeMode === "grid" ? "page" : undefined}
  >
    <span class="glyph" aria-hidden="true">▦</span>
    <span class="label">Grid</span>
  </button>
  <button
    class="navitem"
    class:on={onPreview}
    class:locked={!previewUnlocked}
    onclick={goPreview}
    aria-disabled={!previewUnlocked}
    aria-label={previewUnlocked ? undefined : "Preview, locked — write one round first"}
    aria-current={onPreview ? "page" : undefined}
  >
    <span class="glyph" aria-hidden="true">✦</span>
    <span class="label">Preview</span>
    {#if !previewUnlocked}<span class="lockhint">Write 1 round first</span>{/if}
  </button>
</nav>

<style>
  .bottomnav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 6;
    display: flex;
    padding-bottom: env(safe-area-inset-bottom);
    border-top: 1px solid var(--rule);
    background: color-mix(in oklch, var(--paper) 88%, transparent);
    backdrop-filter: blur(10px);
  }
  .navitem {
    flex: 1;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--ink-soft);
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 8px;
    transition:
      background 0.2s,
      color 0.2s;
  }
  /* Only honour hover on devices that truly hover, so the highlight does not
     "stick" on a touch tab after tapping it on iPad/phone. */
  @media (hover: hover) {
    .navitem:not(.locked):not(.on):hover {
      color: var(--indigo);
    }
    .navitem.on:hover {
      color: var(--paper);
      background: var(--indigo-bright);
    }
  }
  .navitem.on {
    background: var(--indigo);
    color: var(--paper);
  }
  .navitem.locked {
    cursor: default;
  }
  /* Dim only the icon + tab name, not the informational lock hint, so the
     "why is this locked" text keeps readable contrast (was failing at the
     0.45 whole-item opacity). */
  .navitem.locked .glyph,
  .navitem.locked .label {
    opacity: 0.45;
  }
  .glyph {
    font-size: 1.1rem;
    line-height: 1;
  }
  .label {
    font-size: 0.78rem;
    line-height: 1;
  }
  .lockhint {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--ink-soft);
    line-height: 1;
    margin-top: 2px;
  }
</style>
