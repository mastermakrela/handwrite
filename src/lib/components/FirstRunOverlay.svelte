<script lang="ts">
  import { modal } from "$lib/actions/modal";
  let { onDismiss }: { onDismiss: () => void } = $props();
</script>

<div class="backdrop" role="presentation" onclick={onDismiss}>
  <div
    class="card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="firstrun-title"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === "Escape" && onDismiss()}
    tabindex="-1"
    use:modal
  >
    <h2 id="firstrun-title">Your handwriting, turned into a font</h2>
    <ol class="steps">
      <li>
        <b>Step 1 — Write the sentence.</b> Use your Apple Pencil to write the phrase on the line, in your normal
        handwriting. (Rest your palm freely — only the Pencil draws.)
      </li>
      <li>
        <b>Step 2 — Add another round.</b> When you're done, tap "Add another round" and write the same phrase again.
        Each round makes your letters look more natural.
      </li>
      <li>
        <b>Step 3 — See your font.</b> After 3 rounds, open Preview to see your handwriting as a real font — and
        download it.
      </li>
    </ol>
    <div class="actions">
      <button class="primary" onclick={onDismiss}>Got it, let's write</button>
      <button class="skip" onclick={onDismiss}>Skip</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(16px, 4vw, 40px);
    background: color-mix(in oklch, var(--night) 55%, transparent);
    backdrop-filter: blur(2px);
  }
  .card {
    max-width: 34rem;
    width: 100%;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 13px;
    padding: clamp(22px, 4vw, 34px);
    box-shadow: 0 18px 50px oklch(30% 0.085 278 / 0.28);
  }
  .card:focus-visible {
    outline: none;
  }
  h2 {
    font-family: "Shantell Sans", cursive;
    font-weight: 600;
    color: var(--indigo);
    font-size: clamp(1.5rem, 4vw, 2rem);
    line-height: 1.1;
    margin: 0 0 clamp(16px, 3vw, 24px);
  }
  .steps {
    list-style: none;
    counter-reset: step;
    margin: 0;
    padding: 0;
    display: grid;
    gap: clamp(12px, 2vw, 18px);
  }
  .steps li {
    color: var(--ink-soft);
    font-size: clamp(0.95rem, 1.8vw, 1.05rem);
    line-height: 1.5;
  }
  .steps li b {
    color: var(--ink);
    font-weight: 700;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: clamp(22px, 4vw, 30px);
  }
  button {
    font: inherit;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-weight: 600;
    cursor: pointer;
  }
  .primary {
    background: var(--indigo);
    color: var(--paper);
    border: 1px solid var(--indigo);
    border-radius: 13px;
    font-size: 1.02rem;
    padding: 13px 24px;
    transition: background 0.25s, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .primary:hover {
    background: var(--indigo-bright);
    border-color: var(--indigo-bright);
    transform: translateY(-1px);
  }
  .skip {
    background: none;
    border: none;
    color: var(--ink-soft);
    font-size: 0.95rem;
    border-bottom: 2px solid var(--rule);
    padding: 0 0 2px;
    border-radius: 0;
    transition: color 0.2s, border-color 0.2s;
  }
  .skip:hover {
    color: var(--indigo-bright);
    border-color: var(--indigo-bright);
  }
</style>
