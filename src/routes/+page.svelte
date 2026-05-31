<script lang="ts">
  // Landing page. Concept: a penmanship copybook that doubles as a type
  // specimen. The page rides the same guide rules the capture canvas draws;
  // Bricolage Grotesque (drawn grotesque) carries the "type" voice, Shantell
  // Sans carries the "hand". Warm paper, deep ink, indigo as the structural rule.
  const charset = [
    "abcdefghijklmnopqrstuvwxyz",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "0123456789  .,!?’\"-:;()",
    "ä ö ü ß   ą ć ę ł ń ó ś ź ż",
  ];
</script>

<svelte:head>
  <title>handwrite — a font that writes like you</title>
  <meta
    name="description"
    content="handwrite turns the letters you draw into a real, installable font (.otf), entirely on your device. Write them on an iPad with an Apple Pencil and export a typeface that looks like your hand."
  />
  <link rel="stylesheet" href="/fonts/fonts.css" />
  <link rel="canonical" href="https://handwrite.app/" />
  <meta property="og:title" content="handwrite — a font that writes like you" />
  <meta property="og:description" content="Turn your handwriting into a real, installable font. On your device, no account, no upload." />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="/icons/icon-512.png" />
  <meta name="twitter:card" content="summary" />
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "handwrite",
    applicationCategory: "DesignApplication",
    operatingSystem: "iPadOS, Web",
    description: "Turn your handwriting into a real, installable font, entirely on your device.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  })}<\/script>`}
</svelte:head>

<div class="page">
  <header class="bar">
    <a class="mark" href="/">handwrite</a>
    <a class="open" href="/app">Open the studio <span aria-hidden="true">→</span></a>
  </header>

  <main>
    <section class="hero">
      <p class="eyebrow r1">A type foundry the size of your hand</p>
      <h1 class="lined r2">A font that writes like <span class="you">you</span>.</h1>
      <p class="lede r3">
        handwrite turns the letters you draw into a real, installable font. Write each one on your
        iPad, get back an <code>.otf</code> that looks unmistakably like your hand, ready for any app
        on any device.
      </p>
      <div class="actions r4">
        <a class="cta" href="/app">Open the studio <span aria-hidden="true">→</span></a>
        <a class="ghost" href="#how">How it works <span aria-hidden="true">↓</span></a>
      </div>
      <p class="fine r5">No account, no upload, no server. Your handwriting never leaves the device.</p>
    </section>

    <section class="proof">
      <div class="say">
        <h2>Proofed on the only sentence that matters.</h2>
        <p>
          Every typeface earns its name on a pangram, the one line that spends all twenty-six letters.
          Write yours a few times and handwrite learns to vary each letter the way your hand already
          does, so no two e's come out stamped from the same mould.
        </p>
      </div>
      <p class="pangram lined">the quick brown fox jumps over the lazy dog</p>
    </section>

    <section class="how" id="how">
      <h2>Blank page to typeface, in three passes.</h2>
      <ol class="steps">
        <li>
          <span class="num">01</span>
          <div>
            <h3>Write</h3>
            <p>
              Trace the alphabet on guided lines, one letter per cell. Or write a short phrase and
              slice it into letters the way they actually look mid-word. Apple Pencil with palm
              rejection, so your hand can rest on the glass.
            </p>
          </div>
        </li>
        <li>
          <span class="num">02</span>
          <div>
            <h3>Repeat</h3>
            <p>
              Write it again. Every pass becomes an alternate, and your font rotates through them as
              you type. The previous attempt sits faint underneath, so you can find your own rhythm.
            </p>
          </div>
        </li>
        <li>
          <span class="num">03</span>
          <div>
            <h3>Export</h3>
            <p>
              Download the <code>.otf</code> and install it like any other font. Save a JSON backup of
              your raw strokes to carry between devices or finish later.
            </p>
          </div>
        </li>
      </ol>
    </section>

    <section class="charset">
      <div class="say">
        <h2>Your whole alphabet, accents and all.</h2>
        <p>
          Lowercase, capitals, digits and punctuation, plus German and the complete Polish set.
          Descenders, x-height and cap-height are handled, so g, j, ł and ß all land where they
          should.
        </p>
      </div>
      <div class="specimen" aria-label="Character set: a to z, A to Z, digits, punctuation, German and Polish accents">
        {#each charset as row}<span class="row lined">{row}</span>{/each}
      </div>
    </section>

    <section class="vault">
      <div class="wrap">
        <h2>It never leaves your hands.</h2>
        <p>
          There is no backend to send anything to. Your strokes live in this browser and the font is
          built on your device. Clear your data and it is genuinely gone, which is exactly why the
          export buttons exist. handwrite is a small, personal tool, made for the joy of making one.
        </p>
      </div>
    </section>

    <section class="install">
      <h2>Keep it on the home screen.</h2>
      <p>
        In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. handwrite
        opens full-screen and keeps working with no signal. Paper and pen not included.
      </p>
      <a class="cta" href="/app">Open the studio <span aria-hidden="true">→</span></a>
    </section>
  </main>

  <footer>drawn by hand, kept on your device</footer>
</div>

<style>
  :global(html) { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  :global(body) { margin: 0; background: oklch(97.6% 0.008 95); }

  .page {
    --paper: oklch(97.6% 0.008 95);
    --paper-deep: oklch(95.4% 0.011 92);
    --ink: oklch(25% 0.045 270);
    --ink-soft: oklch(43% 0.04 272);
    --indigo: oklch(47% 0.15 277);
    --indigo-bright: oklch(60% 0.17 280);
    --rule: oklch(47% 0.15 277 / 0.24);
    --night: oklch(30% 0.085 278);

    background: var(--paper);
    color: var(--ink);
    min-height: 100svh;
    font-family: "Bricolage Grotesque", system-ui, sans-serif;
    font-optical-sizing: auto;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    overflow-x: hidden;
  }
  /* copybook baseline rule under every line of a text block */
  .lined {
    --period: 1.34em;
    line-height: var(--period);
    background-image: linear-gradient(to bottom, transparent calc(var(--period) - 2px), var(--rule) calc(var(--period) - 2px));
    background-size: 100% var(--period);
    background-position: 0 0.16em;
  }

  code {
    font-family: "Bricolage Grotesque", ui-monospace, monospace;
    font-weight: 600;
    background: var(--paper-deep);
    border: 1px solid var(--rule);
    padding: 0 0.34em;
    border-radius: 5px;
    font-size: 0.92em;
  }

  /* ---- header ---- */
  .bar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: clamp(14px, 2.4vw, 26px) clamp(18px, 5vw, 64px) 0;
  }
  .mark {
    font-family: "Shantell Sans", cursive;
    font-weight: 600;
    font-size: clamp(1.5rem, 3.4vw, 2rem);
    color: var(--indigo);
    text-decoration: none;
    letter-spacing: -0.01em;
  }
  .open {
    color: var(--ink);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.95rem;
    border-bottom: 2px solid var(--rule);
    padding-bottom: 3px;
    transition: border-color 0.25s, color 0.25s;
  }
  .open:hover { color: var(--indigo-bright); border-color: var(--indigo-bright); }

  main { width: 100%; }
  section { padding-inline: clamp(18px, 5vw, 64px); }

  /* ---- hero ---- */
  .hero {
    max-width: 1080px;
    margin: 0 auto;
    padding-top: clamp(40px, 9vw, 120px);
    padding-bottom: clamp(48px, 9vw, 130px);
  }
  .eyebrow {
    font-size: clamp(0.78rem, 1.4vw, 0.95rem);
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--indigo);
    margin: 0 0 clamp(18px, 3vw, 30px);
  }
  h1 {
    font-size: clamp(2.6rem, 9.2vw, 7.2rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0;
    max-width: 16ch;
    background-position: 0 0.2em;
  }
  .you {
    font-family: "Shantell Sans", "Bradley Hand", "Comic Sans MS", cursive;
    font-weight: 600;
    font-style: normal;
    color: var(--indigo-bright);
    letter-spacing: 0.01em;
    padding-right: 0.06em;
    display: inline-block;
  }
  .lede {
    font-size: clamp(1.08rem, 2.2vw, 1.5rem);
    line-height: 1.5;
    color: var(--ink-soft);
    max-width: 46ch;
    margin: clamp(26px, 4vw, 44px) 0 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: clamp(14px, 2.4vw, 26px);
    margin-top: clamp(28px, 4vw, 44px);
  }
  .cta {
    display: inline-block;
    background: var(--indigo);
    color: var(--paper);
    text-decoration: none;
    font-weight: 700;
    font-size: 1.05rem;
    padding: 14px 26px;
    border-radius: 13px;
    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), background 0.25s;
  }
  .cta:hover { background: var(--indigo-bright); transform: translateY(-2px); }
  .ghost {
    color: var(--ink);
    text-decoration: none;
    font-weight: 600;
    font-size: 1.02rem;
    border-bottom: 2px solid var(--rule);
    padding-bottom: 3px;
    transition: border-color 0.25s;
  }
  .ghost:hover { border-color: var(--indigo-bright); }
  .fine {
    font-size: 0.92rem;
    color: var(--ink-soft);
    margin: clamp(24px, 4vw, 40px) 0 0;
  }

  /* ---- shared section heads ---- */
  h2 {
    font-size: clamp(1.7rem, 4.2vw, 3.1rem);
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.08;
    margin: 0;
    max-width: 18ch;
  }
  .say { max-width: 60ch; }
  .say p {
    font-size: clamp(1rem, 1.8vw, 1.22rem);
    line-height: 1.6;
    color: var(--ink-soft);
    margin: clamp(14px, 2vw, 22px) 0 0;
    max-width: 54ch;
  }

  /* ---- proof / pangram ---- */
  .proof {
    max-width: 1180px;
    margin: 0 auto;
    padding-block: clamp(40px, 7vw, 96px);
    border-top: 1px solid var(--rule);
  }
  .pangram {
    font-family: "Shantell Sans", "Bradley Hand", "Comic Sans MS", cursive;
    font-weight: 500;
    color: var(--ink);
    font-size: clamp(1.6rem, 6vw, 4.2rem);
    margin: clamp(30px, 5vw, 60px) 0 0;
    --period: 1.5em;
    word-spacing: 0.05em;
  }

  /* ---- how it works ---- */
  .how {
    max-width: 1180px;
    margin: 0 auto;
    padding-block: clamp(40px, 7vw, 96px);
    border-top: 1px solid var(--rule);
  }
  .steps {
    list-style: none;
    margin: clamp(28px, 5vw, 56px) 0 0;
    padding: 0;
    display: grid;
    gap: clamp(28px, 4vw, 48px);
  }
  .steps li {
    display: grid;
    grid-template-columns: minmax(2.4ch, auto) 1fr;
    gap: clamp(18px, 4vw, 48px);
    align-items: start;
    max-width: 64ch;
  }
  .num {
    font-weight: 800;
    font-size: clamp(1.6rem, 4vw, 2.8rem);
    color: var(--indigo);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .steps h3 {
    font-size: clamp(1.2rem, 2.6vw, 1.7rem);
    font-weight: 700;
    margin: 0 0 0.3em;
    letter-spacing: -0.02em;
  }
  .steps p {
    font-size: clamp(0.98rem, 1.7vw, 1.16rem);
    line-height: 1.6;
    color: var(--ink-soft);
    margin: 0;
  }

  /* ---- character set specimen ---- */
  .charset {
    max-width: 1180px;
    margin: 0 auto;
    padding-block: clamp(40px, 7vw, 96px);
    border-top: 1px solid var(--rule);
  }
  .specimen {
    margin-top: clamp(28px, 5vw, 56px);
    display: grid;
    gap: 0.45em;
  }
  .specimen .row {
    font-family: "Shantell Sans", "Bradley Hand", "Comic Sans MS", cursive;
    font-weight: 500;
    color: var(--ink);
    font-size: clamp(1.3rem, 4.6vw, 3rem);
    --period: 1.42em;
    letter-spacing: 0.04em;
    word-break: break-word;
  }

  /* ---- privacy: drenched ---- */
  .vault {
    background: var(--night);
    color: var(--paper);
    margin-top: clamp(40px, 7vw, 96px);
    padding-block: clamp(56px, 10vw, 140px);
  }
  .vault .wrap { width: min(100%, 1180px); margin-inline: auto; }
  .vault h2 { color: var(--paper); }
  .vault p {
    color: oklch(90% 0.02 280);
    font-size: clamp(1.05rem, 2vw, 1.4rem);
    line-height: 1.62;
    max-width: 56ch;
    margin: clamp(20px, 3vw, 32px) 0 0;
  }

  /* ---- install ---- */
  .install {
    max-width: 1180px;
    margin: 0 auto;
    padding-block: clamp(48px, 8vw, 110px);
    text-align: left;
  }
  .install p {
    font-size: clamp(1.02rem, 1.9vw, 1.3rem);
    line-height: 1.6;
    color: var(--ink-soft);
    max-width: 50ch;
    margin: clamp(16px, 2.4vw, 26px) 0 clamp(28px, 4vw, 40px);
  }
  .install strong { color: var(--ink); font-weight: 700; }

  footer {
    border-top: 1px solid var(--rule);
    padding: 28px clamp(18px, 5vw, 64px) calc(28px + env(safe-area-inset-bottom));
    font-family: "Shantell Sans", cursive;
    color: var(--ink-soft);
    font-size: 1.05rem;
  }

  /* ---- entrance motion (opt-in; reduced-motion users see final state) ---- */
  @media (prefers-reduced-motion: no-preference) {
    .hero .r1, .hero .r2, .hero .r3, .hero .r4, .hero .r5 {
      opacity: 0;
      transform: translateY(16px);
      animation: rise 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    .hero .r1 { animation-delay: 0.05s; }
    .hero .r2 { animation-delay: 0.16s; }
    .hero .r3 { animation-delay: 0.34s; }
    .hero .r4 { animation-delay: 0.46s; }
    .hero .r5 { animation-delay: 0.56s; }
    .you {
      clip-path: inset(0 100% 0 0);
      animation: write 0.95s 0.62s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes rise { to { opacity: 1; transform: none; } }
    @keyframes write { to { clip-path: inset(0 0 0 0); } }
  }
</style>
