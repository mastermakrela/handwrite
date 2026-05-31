<script lang="ts">
  import { cap, gotoPass, doneInPass, chars, profiles, roundsDone } from "$lib/capture.svelte";

  let {
    onOpenProfiles,
    onOpenPen,
    mode = "edit",
  }: { onOpenProfiles: () => void; onOpenPen?: () => void; mode?: "edit" | "preview" } = $props();

  const total = $derived(Math.max(cap.target, cap.passes.length));
  const done = $derived(roundsDone());
  const totalChars = $derived(chars().length);
  const activeName = $derived(profiles.list.find((p) => p.id === profiles.activeId)?.name ?? "Profile");

  function hasContent(i: number): boolean {
    const p = cap.passes[i];
    return !!p && Object.values(p).some((s) => s?.length);
  }
</script>

<header>
  <a class="logo" href="/" title="About handwrite">handwrite</a>

  {#if mode === "preview"}
    <!-- Preview shows the combined font from every round, so the per-round
         selector would be misleading here — show a static summary instead. -->
    <div class="summary" aria-label="Preview of your full font">
      <span class="meter-text">Your font</span>
      <span class="summary-sub">{done} {done === 1 ? "round" : "rounds"}</span>
    </div>
  {:else}
    <div class="meter" aria-label="Rounds progress">
      <span class="meter-text">Round {cap.activePass + 1} of {total}</span>
      <div class="dots">
        {#each Array(total) as _, i (i)}
          {@const real = i < cap.passes.length}
          <button
            class="dot"
            class:filled={real && hasContent(i)}
            class:current={i === cap.activePass}
            disabled={!real}
            onclick={() => real && gotoPass(i)}
            aria-label={real ? `Round ${i + 1}, ${doneInPass(i)}/${totalChars} letters` : `Round ${i + 1}, not started`}
            title={real ? `Round ${i + 1}, ${doneInPass(i)}/${totalChars} letters` : `Round ${i + 1}`}
          ></button>
        {/each}
      </div>
    </div>
  {/if}

  <span class="spacer"></span>

  {#if onOpenPen}
    <button class="pen-trigger" onclick={onOpenPen} aria-haspopup="dialog" aria-label="Pen settings" title="Pen">
      <span aria-hidden="true">✎</span>
      <span class="pen-label">Pen</span>
    </button>
  {/if}

  <button class="profile-trigger" onclick={onOpenProfiles} aria-haspopup="dialog" aria-label="Profiles">
    <span class="pname">{activeName}</span>
    <span class="chev" aria-hidden="true">▾</span>
  </button>
</header>

<style>
  header {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: calc(10px + env(safe-area-inset-top)) clamp(14px, 4vw, 28px) 10px;
    background: color-mix(in oklch, var(--paper) 88%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--rule);
  }
  .logo {
    font-family: "Shantell Sans", cursive;
    font-weight: 600;
    font-size: 1.6rem;
    color: var(--indigo);
    text-decoration: none;
    letter-spacing: -0.01em;
    line-height: 1;
  }
  .spacer {
    flex: 1;
  }
  .meter, .summary {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: calc(8px + env(safe-area-inset-top));
  }
  .summary { gap: 2px; }
  .summary .meter-text {
    font-family: "Shantell Sans", cursive;
    font-weight: 600;
    font-size: 1rem;
    color: var(--indigo);
  }
  .summary-sub {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .meter-text {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .dots {
    display: flex;
    align-items: center;
    /* vertically the 44px targets are taller than the row; pull the bar back so
       they don't blow out the header height */
    margin: -16px 0;
  }
  .dot {
    /* >=44px transparent hit area (WCAG 2.5.5/2.5.8); the visible 10px dot is
       drawn by the ::before pseudo-element so neighbours never overlap */
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dot::before {
    content: "";
    width: 10px;
    height: 10px;
    border-radius: 999px;
    border: 1.5px solid var(--indigo);
    background: transparent;
    transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .dot.filled::before {
    background: var(--indigo);
  }
  .dot.current::before {
    box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--indigo);
    transform: scale(1.05);
  }
  .dot:disabled::before {
    border-color: var(--rule);
    opacity: 0.7;
  }
  .dot:disabled {
    cursor: default;
  }
  .profile-trigger, .pen-trigger {
    display: flex;
    align-items: center;
    gap: 5px;
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--ink);
    background: var(--paper-deep);
    border: 1px solid var(--rule);
    border-radius: 11px;
    padding: 8px 12px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .pen-trigger { margin-right: 8px; }
  .profile-trigger:hover, .pen-trigger:hover {
    border-color: var(--indigo);
    color: var(--indigo);
  }
  @media (max-width: 560px) {
    .pen-label { display: none; }
  }
  .pname {
    max-width: 11rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chev {
    font-size: 0.7rem;
    opacity: 0.7;
  }
  /* Narrow widths: the absolutely-centred meter can collide with the logo or
     profile button. Drop the wordy "Round N of M" label, keep the compact dots,
     and tighten the profile name so the three-up header stays clear. */
  @media (max-width: 700px) {
    .meter .meter-text {
      display: none;
    }
    .pname {
      max-width: 7rem;
    }
  }
  @media (max-width: 420px) {
    .pname {
      max-width: 4.5rem;
    }
  }
</style>
