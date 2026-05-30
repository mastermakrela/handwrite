<script lang="ts">
  // Landing / explainer page. Styling here is intentionally minimal — a proper
  // visual pass comes later; this round is about getting the content right.
</script>

<svelte:head>
  <title>handwrite — turn your handwriting into a font</title>
  <meta
    name="description"
    content="handwrite turns your real handwriting into a usable font (.otf), entirely on your device. Write the letters on an iPad with an Apple Pencil, export a font you can install anywhere."
  />
</svelte:head>

<header class="top">
  <span class="logo">handwrite</span>
  <a class="cta" href="/app">Open the studio →</a>
</header>

<main>
  <section class="hero">
    <h1>Your handwriting, as a real font.</h1>
    <p class="lede">
      <strong>handwrite</strong> turns the letters you draw into an installable font file — the same
      <code>.otf</code> you'd buy from a type foundry, except it's yours and it looks like
      <em>you</em>. You write each letter once (or a few times); it stitches them into a font you can
      use in any app on any device.
    </p>
    <p class="lede">
      Everything happens <strong>on your device</strong>. Your handwriting never leaves the browser —
      there's no account, no upload, no server. It's a small, personal tool, built for fun.
    </p>
    <a class="cta big" href="/app">Start writing →</a>
  </section>

  <section>
    <h2>How it works</h2>
    <ol class="steps">
      <li>
        <h3>1 · Write the letters</h3>
        <p>
          On an iPad with an Apple Pencil (palm rejection keeps your hand from drawing), fill in each
          character. Two ways to do it: a <strong>grid</strong> of one-letter cells, or
          <strong>sentence mode</strong> — write a short phrase naturally, then mark the gaps between
          letters so each one feels the way it does inside a real word.
        </p>
      </li>
      <li>
        <h3>2 · Do a few passes</h3>
        <p>
          Write the alphabet more than once. Each pass becomes an <strong>alternate</strong> of every
          letter, and the font quietly rotates between them as you type — so your double-l's and
          repeated e's don't come out looking stamped from a mould. The previous pass shows faintly
          underneath so you can trace your own rhythm.
        </p>
      </li>
      <li>
        <h3>3 · Export your font</h3>
        <p>
          Download a finished <code>.otf</code> and install it like any other font. You can also
          export your raw strokes as a JSON file to back up or move between devices, and re-import
          them later.
        </p>
      </li>
    </ol>
  </section>

  <section>
    <h2>What it can capture</h2>
    <ul class="features">
      <li><strong>The full Latin set</strong> — a–z, A–Z, digits, and common punctuation.</li>
      <li><strong>German and Polish accents</strong> — ä ö ü ß, and the complete Polish set (ą ć ę ł ń ó ś ź ż).</li>
      <li><strong>Natural variation</strong> — multiple alternates per letter, cycled automatically.</li>
      <li><strong>Profiles</strong> — sharing one tablet? Each person keeps their own letters, stored separately.</li>
      <li><strong>Baselines and guides</strong> — x-height, cap-height, and descenders are handled, so g, j, p, y (and ł) sit correctly.</li>
    </ul>
  </section>

  <section class="privacy">
    <h2>Private by default</h2>
    <p>
      There is no backend. Your strokes are saved locally in your browser and the font is built right
      on your device. Nothing is uploaded anywhere — if you clear your browser data, it's gone, which
      is exactly why the <strong>export</strong> buttons exist. Keep a JSON backup of anything you care
      about.
    </p>
  </section>

  <section class="install">
    <h2>Install it on your iPad</h2>
    <p>
      handwrite works in the browser, but it's nicer as an app. In Safari, open it, tap
      <strong>Share → Add to Home Screen</strong>. It launches full-screen and keeps working offline.
    </p>
    <a class="cta" href="/app">Open the studio →</a>
  </section>
</main>

<footer>
  <span>handwrite · a personal project · everything stays on your device</span>
</footer>

<style>
  :global(:root) { --ink: #1d2347; --accent: #3b3f9e; --line: #e6e9f2; --muted: #7a8499; }
  :global(html, body) {
    margin: 0; background: #f6f7fb; color: var(--ink);
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.55;
    -webkit-text-size-adjust: 100%;
  }
  .top {
    display: flex; align-items: center; justify-content: space-between;
    padding: calc(12px + env(safe-area-inset-top)) 20px 12px; border-bottom: 1px solid var(--line);
  }
  .logo { font-family: "Snell Roundhand", "Segoe Script", cursive; font-size: 1.6rem; color: var(--accent); }
  main { max-width: 64ch; margin: 0 auto; padding: 8px 20px 40px; }
  .cta {
    display: inline-block; font-weight: 600; text-decoration: none; color: #fff; background: var(--accent);
    padding: 9px 16px; border-radius: 10px;
  }
  .cta.big { margin-top: 8px; padding: 12px 20px; font-size: 1.05rem; }
  .hero { padding: 32px 0 8px; }
  h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 16px; }
  .lede { font-size: 1.08rem; color: #2b3252; }
  h2 { font-size: 1.3rem; margin: 40px 0 12px; }
  h3 { font-size: 1rem; margin: 0 0 4px; color: var(--accent); }
  code { background: #eef0f8; padding: 1px 6px; border-radius: 6px; font-size: 0.92em; }
  .steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 20px; }
  .features { padding-left: 1.1em; display: grid; gap: 8px; }
  .privacy, .install { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 4px 20px 20px; }
  footer { border-top: 1px solid var(--line); padding: 18px 20px calc(18px + env(safe-area-inset-bottom)); color: var(--muted); font-size: 0.85rem; text-align: center; }
</style>
