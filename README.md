# handwrite

Turn your **real handwriting** into a usable Unicode font (`.otf` / `.ttf` / `.woff2`) you can use on the web, in editors, and in messages — processed **on-device**, so your handwriting never leaves your machine.

> Status: **font engine proven; emotional fidelity unproven.** This repo contains the portable core
> library + five runnable proofs. After an adversarial review (see `docs/report.html`), the honest
> position is: the font *container*, *variation*, *curve quality*, and *spacing* are de-risked in code,
> but **whether a real person's handwriting renders as recognisably *theirs* is the open kill-gate**
> (PLAN.md Phase 0.5). See [`docs/PLAN.md`](docs/PLAN.md) and [`docs/report.html`](docs/report.html).

## The idea

1. **Ingest** your handwriting — either by **drawing** with an Apple Pencil / pointer, or by
   **photographing** a printed calibration sheet you've filled in (one character per box).
2. **Vectorize** each glyph into the Bézier outlines fonts are made of.
3. **Assemble** a real font file, with natural per-letter variation, that works everywhere.

## The app

A SvelteKit single-page app (no SSR) in `src/`, served as static assets by a Cloudflare Worker at
<https://handwrite.mastermakrela.com>. Strokes and profiles live in the browser's `localStorage`; nothing is uploaded.

```bash
bun install
bun run dev      # vite dev --host
bun run build    # adapter-cloudflare -> .svelte-kit/cloudflare
bun run lint     # oxfmt --check && oxlint
bun run test     # headless smoke scripts in app/*-smoke.ts
```

Routes: `/` landing page, `/app` capture (Write / Grid), `/app/preview` font preview and `.otf` export.

## Proofs (run them)

```bash
bun install
python3 -m venv .venv && .venv/bin/pip install fonttools brotli uharfbuzz

bun run proof:all     # runs A, C, B, E, D in sequence
bun run validate      # independent fontTools validation of every generated font

# or individually:
bun run proof:font        # A: opentype.js builds a valid .otf in pure JS  (browser path)
bun run proof:stroke      # C: pen stroke -> perfect-freehand -> font glyph (direct-draw path)
bun run proof:variation   # B: fontTools real .ttf + .woff2 + calt cycling  (variation path)
bun run proof:curvefit    # E: RDP+cubic-fit (127→59 cmds) + ink-derived metrics
bun run template          # D: generate a printable calibration sheet (photo path front-end)
```

| Proof | Proves | Result |
|------|--------|--------|
| **A** `01-opentype-font.ts` | JS-only, in-browser → valid OpenType font (lines, curves, counters, cmap) | ✅ valid CFF `.otf` |
| **C** `02-stroke-to-glyph.ts` | captured pen stroke → smooth glyph outline → font | ✅ stroke→glyph |
| **B** `03-calt-variation.py` | real `.ttf` + `.woff2` + `calt` alternates that **shape/cycle** in HarfBuzz | ✅ `a → a.calt1 → a.calt2 → …` |
| **D** `04-generate-template.ts` | printable calibration sheet with registration markers | ✅ SVG sheet |
| **E** `05-curvefit-metrics.ts` | *(post-review)* RDP+cubic-fit kills point-bloat; metrics from ink | ✅ 127→59 cmds; advances vary |

## Repo layout

```
src/lib/handwrite/        portable, framework-agnostic core (the future app imports this)
  types.ts                shared GlyphOutline/FontSpec data model (both ingest modes target it)
  font/opentype-builder.ts  FontSpec -> opentype.js Font -> bytes (browser)
  capture/stroke.ts       pointer strokes -> perfect-freehand outline -> normalized glyph
src/routes, src/lib/components   the SvelteKit app (capture UI, preview, landing page)
app/                      older single-file capture app (`legacy:*` scripts) and the smoke scripts behind `bun run test`
proofs/                   runnable feasibility proofs + fontTools validator
docs/                     PLAN.md, ARCHITECTURE.md, RESEARCH.md, report.html
```

## Key decisions (see `docs/ARCHITECTURE.md`)

- **Browser-first, on-device** — privacy moat + ~$0 infra (Cloudflare Pages).
- **opentype.js** writes the font in the browser (a valid CFF `.otf`); a **fontTools** step
  (also runnable client-side via Pyodide) adds true `.ttf`/`.woff2` and the `calt` variation
  feature opentype.js cannot author.
- **Variation = multiple alternates + deterministic `calt` cycling**, not variable fonts, not `rand`.
- **Photo path requires a printed grid + fiducial markers** — that's what makes segmentation tractable.
- **GPL note:** Potrace and its WASM/JS ports are GPL-2.0 — resolve before monetizing (service boundary, commercial licence, or a permissive tracer).
