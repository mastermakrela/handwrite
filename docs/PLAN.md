# handwrite — plan & roadmap

Goal order (from the brief): **(1) prove it's possible → (2) web/mobile product → (3) monetize.**

## Phase 0 — Feasibility proof ✅ (done in this repo)

De-risk the scary technical claims with runnable code before building any UI.

- [x] **A** opentype.js builds a valid font in pure JS (browser path) — `proofs/01`
- [x] **C** captured pen stroke → font glyph via perfect-freehand (direct-draw path) — `proofs/02`
- [x] **B** real `.ttf` + `.woff2` + `calt` variation that shapes/cycles in HarfBuzz — `proofs/03`
- [x] **D** printable calibration template with registration markers — `proofs/04`
- [x] **E** curve-fit (RDP + cubic Bézier) + metrics engine on a *noisy* stroke — `proofs/05`
- [x] independent validation of every generated font with fontTools — `proofs/validate.py`

**Honest verdict (revised after the adversarial review — see report.html):** the font *container*
and the variation *mechanism* are solved, and after Proof E the curve-quality and spacing objections
are addressed in code (127→59 commands, smooth cubics; ink-derived advance widths, not a hardcoded
600). What is **NOT yet proven** is the only thing the product is ultimately sold on: that a **real
human's real handwriting** (not a synthetic-but-noisy arc) renders a paragraph they recognise as
*theirs*. That — plus market differentiation — is the real remaining risk, and it is the kill-gate
below. The earlier "the scary half is solved" framing was wrong: we de-risked the tractable half.

## Phase 0.5 — The kill-gate: "is this *me*?" (do this BEFORE building UI)

The adversary's strongest objection: every proof ran on synthetic input, so the emotional payoff is
unproven. Close that gap with the cheapest possible experiment, and be willing to stop.

1. Get **5 real people** to (a) draw their alphabet on an iPad and (b) write it on paper for a phone
   photo (hand-segment the cells manually — no CV needed yet).
2. Push both through the real pipeline (curve-fit + metrics already exist) and **render a paragraph**.
3. Measure: how many say *"that looks like my handwriting"* unprompted? Does draw-mode lose to paper?
4. In parallel, **measure Pyodide+fontTools+brotli** weight/cold-start on a mid-range phone (the one
   unverified architectural bet).

> **KILL** if no ingestion mode hits a clear majority "yes, that's me." **PROCEED** only if one mode
> passes AND you can name one differentiator a competitor can't copy in a sprint.

## Phase 1 — Direct-draw MVP (web, on-device) — *only after the gate passes*

The cheapest path to a real, installable font. **One MIT TypeScript runtime** — no CV, no Python, no
Potrace, no backend. (Everything heavier is deliberately deferred until this has lovers/payers.)

1. SvelteKit app (`adapter-static`) wrapping `src/lib/handwrite`.
2. Guided capture canvas: one cell per glyph with baseline/x-height guides; PointerEvents +
   `getCoalescedEvents()`; `pointerType==='pen'` palm rejection; `touch-action:none`.
3. Per-glyph: perfect-freehand outline → flatten → curve-fit → metrics. ✅ **Done in Proof E**
   (`capture/simplify.ts` + `font/metrics.ts`).
4. **Anti-abandonment:** a *minimum-viable font* at ~26 lowercase + space + period with instant
   live-preview after the first row; auto-derive uppercase/punctuation defaults; persist progress.
5. Live preview ("type to test") + one-click **`.otf`** download via opentype.js.
6. Ship to Cloudflare Pages. **Milestone: a stranger draws an alphabet and types a paragraph they like.**

## Phase 2 — Real export + variation

1. **Headline output is the opentype.js `.otf`** (works everywhere modern, 100% on-device, instant).
   True `.ttf`/`.woff2` + the `calt` feature become an *optional* export. Pyodide+fontTools is **no
   longer load-bearing**: if the Phase-0.5 measurement shows it's too heavy on mobile, the fallback is
   a **stateless, no-retention** Cloudflare Worker (honest privacy line: *"we never store your
   handwriting,"* not *"it never leaves your device"*).
2. Capture **more alternates than the marketing implies it needs** — 3–4 reads as periodic on doubled
   letters (`aaa`, `committee`); aim for 8–15 on the top ~10 letters with **cross-letter** contextual
   rules, not a per-letter round-robin. Generate the `calt` cycler `.fea` (Proof B's technique).
3. Consistent side bearings across alternates (metrics engine already does per-glyph spacing).
4. **Be honest in-product** that variation needs a shaping context (`calt`): it works in browsers/CSS
   and most chat, but **collapses to identical letters in many code editors and terminals**. Don't sell
   it where it dies. Offer a "baked single-variant" export for non-shaping targets.
5. **Milestone: exported font looks hand-written (non-stamped) in a shaping context and embeds as WOFF2.**

## Phase 3 — Photo pipeline (the "real handwriting from paper" wedge)

1. Finalize the printed template with **real ArUco markers** (replace Proof D placeholders).
2. Python `opencv-contrib-python` reference pipeline: marker detect → homography → flatten →
   per-cell crop → adaptive threshold → Potrace trace → normalize to the shared `GlyphOutline`.
3. Per-cell **accept/reject/redraw** review UI (capture will fail on some cells — plan for it).
4. Port to browser: custom slim **OpenCV.js** build (with aruco) **or** a stateless trace service.
   **Resolve the Potrace GPL question before this ships.**
5. **Milestone: photograph a filled sheet → usable font, fully in the browser.**

## Phase 4 — Product & monetization (only if Phase 0.5 + demand validation pass)

The adversary's strongest *business* point stands: this is a crowded, AI-commoditizing niche, and the
honest default is **ship the engine as an open-source portfolio piece + free on-device toy**, not a
startup. Validate demand *before* building product code:

- **Demand gate:** a fake-door landing page measuring pre-pay/email conversion for the chosen wedge,
  against a realistic CAC. Plus a 1-day teardown: make your own font in free Calligraphr **and**
  Lipi.ai and write the *one* sentence describing what yours does visibly better. Can't fill it → no product.
- **Dropped as differentiators** (the review killed them): the **monospaced coding-font** wedge
  (`calt` dies in editors; a wobbly hand hurts code legibility) and *"more alternates than Calligraphr"*
  (imperceptible, trivially copied). **Privacy** is real engineering but a weak felt purchase-driver.
- **If monetizing at all**, the one buyer with durable willingness-to-pay is the **keepsake/gift**
  segment ("turn a late parent's letters into a font") at **€40–150 with light human QA** — emotional
  WTP, defensible on service quality, and it sidesteps AI commoditization. A self-serve €8–12 unlock for
  a do-it-once novelty has ~zero LTV and likely CAC > LTV.
- The most defensible *interaction* wedge (if any) is **real-time iPad/Pencil draw with instant live
  preview** — a different creative experience, not a cheaper Calligraphr clone.
- Payments via Lemon Squeezy / Paddle (MoR for EU VAT). **Rename** — `handwrite` collides with an
  existing MIT GitHub project (builtree/handwrite).

## Roadmap-only (do NOT build for the prototype)

- **Connected cursive** — fake at the font level later (calt + ligatures / GPOS anchors, Python),
  never by segmenting cursive from a photo (unsolved problem). Constrain the template with connection
  guides if pursued.
- **ML glyph synthesis** to auto-fill unwritten characters — research-grade, CJK-focused, GPU-bound;
  for Latin just ask the user to write all glyphs. Cheap gap-fillers first (combining marks for
  accents, FontForge-style interpolation) before any ML.

## Decisions (post-review)

| # | Question | Decision |
|---|----------|----------|
| 1 | Headline output format | **CFF `.otf`** (opentype.js, on-device, instant). True `.ttf`/`.woff2` is an *optional* export. Don't market the word "TTF". |
| 2 | Pyodide vs service for fontTools | **Not load-bearing.** Try Pyodide; if heavy, stateless no-retention worker. Measure in Phase 0.5. |
| 3 | Potrace GPL | **Avoided for v1** — ship draw-mode only (perfect-freehand + opentype.js are MIT). Revisit only if the photo path is ever justified. |
| 4 | Build the photo pipeline? | **No, not as planned.** It reaches only 15-year-old Calligraphr parity, carries the GPL landmine, and is a worse onboarding than Lipi.ai's template-free flow. |
| 5 | The wedge | Lead with **on-device draw-mode as a free toy / open-source piece**; monetize *only* via the keepsake/gift angle if demand validates. |

## Still genuinely open (for Krzysztof)

- Is this a **product** at all, or the **best version of a personal tool + portfolio/talk**? (The review
  argues hard for the latter unless the keepsake pivot appeals.)
- Does the **iPad real-time draw** interaction excite you enough to build it as a delightful toy
  regardless of monetization?
