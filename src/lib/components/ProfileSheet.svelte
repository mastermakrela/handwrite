<script lang="ts">
  import { tick } from "svelte";
  import { modal } from "$lib/actions/modal";
  import { profiles, createProfile, switchProfile, renameProfile, deleteProfile } from "$lib/capture.svelte";

  let { onClose, onShowIntro }: { onClose: () => void; onShowIntro: () => void } = $props();

  // inline editing state, keyed by profile id
  let renamingId = $state<string | null>(null);
  let renameValue = $state("");
  let confirmDeleteId = $state<string | null>(null);
  let creating = $state(false);
  let createValue = $state("");

  function startRename(id: string, name: string) {
    confirmDeleteId = null;
    creating = false;
    renamingId = id;
    renameValue = name;
    tick().then(() => document.getElementById("rename-input")?.focus());
  }
  function commitRename(id: string) {
    const v = renameValue.trim();
    if (v) renameProfile(id, v);
    renamingId = null;
  }
  function startCreate() {
    renamingId = null;
    confirmDeleteId = null;
    creating = true;
    createValue = "";
    tick().then(() => document.getElementById("create-input")?.focus());
  }
  function commitCreate() {
    createProfile(createValue.trim() || "Untitled");
    creating = false;
    onClose();
  }
  function pick(id: string) {
    switchProfile(id);
    onClose();
  }
  function doDelete(id: string) {
    deleteProfile(id);
    confirmDeleteId = null;
  }
</script>

<div class="backdrop" role="presentation" onclick={onClose}>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label="Profiles"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === "Escape" && onClose()}
    tabindex="-1"
    use:modal
  >
    <header class="sheet-head">
      <span class="title">Profiles</span>
      <button class="close" onclick={onClose} aria-label="Close">✕</button>
    </header>

    <ul class="list">
      {#each profiles.list as p (p.id)}
        <li class="row" class:active={p.id === profiles.activeId}>
          {#if renamingId === p.id}
            <input
              id="rename-input"
              class="edit"
              aria-label="New name for profile"
              value={renameValue}
              oninput={(e) => (renameValue = e.currentTarget.value)}
              onkeydown={(e) => {
                if (e.key === "Enter") commitRename(p.id);
                if (e.key === "Escape") renamingId = null;
              }}
            />
            <button class="icon" onclick={() => commitRename(p.id)} aria-label="Confirm rename">✓</button>
            <button class="icon" onclick={() => (renamingId = null)} aria-label="Cancel rename">✕</button>
          {:else if confirmDeleteId === p.id}
            <span class="confirm">Delete '{p.name}' and all its letters? This can't be undone.</span>
            <button class="icon danger" onclick={() => doDelete(p.id)}>Delete</button>
            <button class="icon" onclick={() => (confirmDeleteId = null)}>Cancel</button>
          {:else}
            <button
              class="name"
              onclick={() => pick(p.id)}
              aria-label={p.id === profiles.activeId ? `${p.name} (current profile)` : `Switch to ${p.name}`}
              aria-current={p.id === profiles.activeId ? "true" : undefined}
            >
              {#if p.id === profiles.activeId}<span class="check" aria-hidden="true">✓</span>{/if}
              {p.name}
            </button>
            <button class="icon" onclick={() => startRename(p.id, p.name)} aria-label="Rename profile">✎</button>
            <button
              class="icon"
              onclick={() => ((confirmDeleteId = p.id), (renamingId = null))}
              disabled={profiles.list.length <= 1}
              aria-label="Delete profile">🗑</button
            >
          {/if}
        </li>
      {/each}
    </ul>

    {#if creating}
      <div class="create">
        <input
          id="create-input"
          class="edit"
          aria-label="Profile name"
          placeholder="Profile name"
          value={createValue}
          oninput={(e) => (createValue = e.currentTarget.value)}
          onkeydown={(e) => {
            if (e.key === "Enter") commitCreate();
            if (e.key === "Escape") creating = false;
          }}
        />
        <button class="icon" onclick={commitCreate}>Create</button>
      </div>
    {:else}
      <button class="newrow" onclick={startCreate}>+ New profile</button>
    {/if}

    <footer class="sheet-foot">
      <button class="link" onclick={() => (onShowIntro(), onClose())}>Show intro again</button>
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
    width: min(24rem, 100%);
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
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--rule);
    border-radius: 11px;
    padding: 4px;
    background: var(--paper);
  }
  .row.active {
    background: var(--indigo);
    border-color: var(--indigo);
  }
  .name {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ink);
    cursor: pointer;
    padding: 8px 10px;
    border-radius: 9px;
    min-height: 40px;
  }
  .row.active .name {
    color: var(--paper);
  }
  .check {
    margin-right: 4px;
  }
  .confirm {
    flex: 1;
    font-size: 0.8rem;
    color: var(--ink);
    padding: 4px 8px;
    line-height: 1.3;
  }
  button {
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    cursor: pointer;
  }
  .icon {
    min-width: 40px;
    min-height: 40px;
    border: 1px solid var(--rule);
    background: var(--paper-deep);
    color: var(--ink);
    border-radius: 9px;
    font-weight: 600;
    font-size: 0.85rem;
    padding: 6px 10px;
    transition: border-color 0.2s, color 0.2s;
  }
  .icon:not(:disabled):hover {
    border-color: var(--indigo);
    color: var(--indigo);
  }
  .icon:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .row.active .icon {
    background: var(--night);
    border-color: color-mix(in oklch, var(--paper) 35%, transparent);
    color: var(--paper);
  }
  .row.active .icon:not(:disabled):hover {
    border-color: var(--paper);
    color: var(--paper);
  }
  .icon.danger {
    color: oklch(52% 0.18 25);
    border-color: oklch(52% 0.18 25 / 0.5);
  }
  .icon.danger:hover {
    color: oklch(52% 0.18 25);
    border-color: oklch(52% 0.18 25);
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
  .edit {
    flex: 1;
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-size: 0.9rem;
    padding: 8px 10px;
    border: 1px solid var(--indigo);
    border-radius: 9px;
    background: var(--paper);
    color: var(--ink);
    min-height: 40px;
  }
  .edit:focus-visible {
    outline-offset: 0;
    box-shadow: 0 0 0 2px var(--indigo);
  }
  .create {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .newrow {
    width: 100%;
    margin-top: 8px;
    border: 1px dashed var(--rule);
    background: var(--paper);
    color: var(--ink-soft);
    border-radius: 11px;
    padding: 10px;
    font-weight: 600;
    font-size: 0.88rem;
    min-height: 44px;
    transition: border-color 0.2s, color 0.2s;
  }
  .newrow:hover {
    border-color: var(--indigo);
    color: var(--indigo);
  }
  .sheet-foot {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--rule);
    display: flex;
    justify-content: center;
  }
  .link {
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 0.82rem;
    text-decoration: underline;
    text-underline-offset: 3px;
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
