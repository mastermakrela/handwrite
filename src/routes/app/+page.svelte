<script lang="ts">
  import { onMount } from "svelte";
  import Cell from "$lib/components/Cell.svelte";
  import SentenceCanvas from "$lib/components/SentenceCanvas.svelte";
  import { CHAR_GROUPS } from "$lib/handwrite/charsets";
  import {
    cap, load, save, newPass, gotoPass, toggleGroup, importPasses, doneInPass, chars,
    profiles, createProfile, switchProfile, renameProfile, deleteProfile,
  } from "$lib/capture.svelte";
  import { glyphsFromPasses } from "$lib/handwrite/font/glyph-from-passes";
  import { buildFont, fontToUint8Array } from "$lib/handwrite/font/opentype-builder";
  import { DEFAULT_METRICS } from "$lib/handwrite/types";

  const groups = $derived(CHAR_GROUPS.filter((g) => cap.enabled.includes(g.id)));
  const total = $derived(chars().length);
  const done = $derived(doneInPass(cap.activePass));

  function download(name: string, blob: Blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportOtf() {
    const glyphs = glyphsFromPasses(cap.passes, chars());
    if (!glyphs.length) return alert("Draw at least one character first.");
    const font = buildFont({ familyName: "My Handwriting", styleName: "Regular", ...DEFAULT_METRICS, glyphs });
    download("MyHandwriting.otf", new Blob([fontToUint8Array(font) as unknown as BlobPart], { type: "font/otf" }));
  }
  function exportPasses() {
    download("handwriting-passes.json", new Blob([JSON.stringify(cap.passes)], { type: "application/json" }));
  }
  function onImport(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        const parsed = JSON.parse(t);
        importPasses(Array.isArray(parsed) ? parsed : [parsed]);
      } catch { alert("Could not read that file."); }
    });
  }

  function addProfile() {
    const name = prompt("New profile name?", "");
    if (name === null) return; // cancelled
    createProfile(name);
  }
  function renameActive() {
    const cur = profiles.list.find((p) => p.id === profiles.activeId);
    const name = prompt("Rename profile", cur?.name ?? "");
    if (name === null) return;
    renameProfile(profiles.activeId, name);
  }
  function deleteActive() {
    const cur = profiles.list.find((p) => p.id === profiles.activeId);
    if (confirm(`Delete profile “${cur?.name}” and all its strokes? This can't be undone.`)) deleteProfile(profiles.activeId);
  }

  onMount(() => {
    load();
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

<header>
  <a class="logo" href="/" title="About handwrite">handwrite</a>
  <div class="profile">
    <select aria-label="profile" value={profiles.activeId} onchange={(e) => switchProfile(e.currentTarget.value)}>
      {#each profiles.list as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
    </select>
    <button onclick={addProfile} aria-label="new profile" title="New profile">+</button>
    <button onclick={renameActive} aria-label="rename profile" title="Rename profile">✎</button>
    <button onclick={deleteActive} disabled={profiles.list.length <= 1} aria-label="delete profile" title="Delete profile">🗑</button>
  </div>
  <div class="modes">
    <button class:on={cap.mode === "grid"} onclick={() => (cap.mode = "grid", save())}>grid</button>
    <button class:on={cap.mode === "sentence"} onclick={() => (cap.mode = "sentence", save())}>sentence</button>
  </div>
  <div class="passes">
    <button onclick={() => gotoPass(cap.activePass - 1)} disabled={cap.activePass === 0} aria-label="previous pass">◂</button>
    <span class="passlabel">pass {cap.activePass + 1}/{cap.passes.length} · <b>{done}/{total}</b></span>
    <button onclick={() => gotoPass(cap.activePass + 1)} disabled={cap.activePass >= cap.passes.length - 1} aria-label="next pass">▸</button>
    <button class="primary" onclick={newPass}>+ pass</button>
  </div>
  <span class="spacer"></span>
  <button onclick={exportOtf}>⬇︎ .otf</button>
  <button onclick={exportPasses}>⬇︎ passes</button>
  <label class="btn">Import<input type="file" accept="application/json" onchange={onImport} /></label>
</header>

<div class="sub">
  <span class="hint">
    Write each character on the solid baseline. Aim for <b>{cap.target} passes</b> — the previous pass shows faint underneath so you can trace it, and the passes become alternates so your font varies naturally. Pencil only (palm-safe); everything stays on your device.
  </span>
  <span class="chips">
    {#each CHAR_GROUPS as g}
      <button class="chip" class:on={cap.enabled.includes(g.id)} onclick={() => toggleGroup(g.id)}>{g.label}</button>
    {/each}
  </span>
</div>

{#if cap.mode === "sentence"}
  <SentenceCanvas />
{:else}
  <main>
    {#each groups as g (g.id)}
      <div class="group">{g.label}</div>
      {#each g.chars as ch (ch.char)}
        <Cell char={ch.char} />
      {/each}
    {/each}
  </main>
{/if}

<style>
  :global(:root) { --ink: #1d2347; --accent: #3b3f9e; --line: #e6e9f2; --muted: #7a8499; }
  :global(html, body) {
    margin: 0; background: #f6f7fb; color: var(--ink);
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    touch-action: pan-y; -webkit-text-size-adjust: 100%;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
    overscroll-behavior-y: contain;
  }
  header {
    position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: calc(8px + env(safe-area-inset-top)) 14px 8px; background: rgba(246, 247, 251, 0.92);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--line);
  }
  .logo { font-family: "Snell Roundhand", "Segoe Script", cursive; font-size: 1.5rem; color: var(--accent); text-decoration: none; }
  .profile { display: flex; align-items: center; gap: 4px; }
  .profile select {
    font: inherit; font-weight: 600; font-size: 0.85rem; color: var(--ink); background: #fff;
    border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; max-width: 11rem;
  }
  .profile button { padding: 7px 10px; font-size: 0.85rem; }
  .modes { display: flex; gap: 4px; }
  .modes button { font-size: 0.82rem; padding: 6px 12px; }
  .modes button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .passes { display: flex; align-items: center; gap: 6px; }
  .passlabel { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
  .spacer { flex: 1; }
  button, label.btn {
    font: inherit; font-weight: 600; font-size: 0.88rem; border: 1px solid var(--line); background: #fff;
    color: var(--ink); padding: 8px 12px; border-radius: 10px; cursor: pointer;
  }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  button:disabled { opacity: 0.4; }
  label.btn input { display: none; }
  .sub { padding: 8px 16px 0; display: flex; flex-direction: column; gap: 8px; }
  .hint { color: var(--muted); font-size: 0.78rem; max-width: 70ch; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { font-size: 0.78rem; padding: 5px 11px; border-radius: 999px; color: var(--muted); }
  .chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 12px; padding: 12px 14px 56px; align-items: start; }
  .group { grid-column: 1 / -1; color: var(--muted); font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px; }
  .group:first-child { margin-top: 0; }
</style>
