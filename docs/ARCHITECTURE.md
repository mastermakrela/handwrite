# Architecture & key decisions

## North star

A **100% on-device** pipeline: handwriting (photo or pen) → glyph outlines → real font, all in
the browser. This single decision delivers three things at once:

1. **Privacy moat** — "your handwriting never leaves your device." No incumbent (Calligraphr,
   YourFonts, Lipi.ai) offers this; they all upload to a server.
2. **~$0 infra** — a static SvelteKit export on Cloudflare Pages (unlimited bandwidth, commercial
   use allowed on the free tier). No servers to run or scale.
3. **GDPR-light** — when processing happens only on the user's device, the user is effectively the
   sole data controller; the "handwriting as biometric" concern (Art. 9) does not bite because we
   never process it "to uniquely identify a person."

## The one shared data model

Both ingestion modes converge on `GlyphOutline` (`src/lib/handwrite/types.ts`): a list of
path commands in **font units, y-up, baseline at origin**. Everything downstream (font assembly,
variation, export) consumes only this shape and never needs to know whether the strokes came from
a camera or an Apple Pencil.

```
  ┌─ DRAW MODE  ── pointer events → perfect-freehand outline → flatten → normalize ─┐
  │                                                                                 ├─► GlyphOutline ─► FontSpec ─► font
  └─ PHOTO MODE ── ArUco homography → cell crop → binarize → Potrace trace → normalize ┘
```

## The JS ↔ Python split (the crux)

opentype.js is great but has two hard limits (verified from source + issue #594):

| Capability | opentype.js (JS, browser) | fontTools (Python) |
|---|---|---|
| Build outlines → font | ✅ | ✅ |
| Output format | **CFF `.otf` only** (no glyf writer) | real `.ttf`, `.otf`, `.woff2` |
| Author `calt`/GSUB variation | ❌ (can't write it) | ✅ (`feaLib`) |
| Author cursive joins (GPOS) | ❌ | ✅ |

**Decision (revised after the adversarial review):** the **`.otf` from opentype.js is the headline
output** — valid everywhere modern, 100% on-device, instant (Proof A). True `.ttf`/`.woff2` + the
`calt` variation feature (Proof B) are an **optional** export, and **Pyodide is no longer
load-bearing**. The earlier "just run fontTools in Pyodide" was hand-waving: Pyodide's runtime is
~6–10 MB of WASM Python with multi-second cold start, and `brotli` (for woff2) is a compiled wheel.
So: try Pyodide and *measure* it (Phase 0.5); if it's too heavy on mobile, fall back to a **stateless,
no-retention** Cloudflare Worker. The honest privacy line then becomes **"we never store your
handwriting"** (ephemeral) rather than "it never leaves your device" — pick that framing up front so
architecture and marketing don't contradict each other.

## Variation strategy (decided)

- **NOT variable fonts** — interpolation requires point-compatible masters; autotraced handwriting
  glyphs never are.
- **NOT the `rand` feature** — unsupported in Safari/iOS, and it reflows text on every load.
- **YES: multiple alternates per letter + deterministic `calt` cycling** (the Caveat/Liza
  technique). Proof B shapes `aaaaa → a, a.calt1, a.calt2, a, a.calt1` in HarfBuzz. Capture
  3–4 alternates for common letters; `calt` is the most reliably-supported web OpenType feature
  (on by default in Safari; enable with `font-feature-settings: 'calt' 1` for Chrome/Firefox).
- **Caveat:** variation collapses in non-shaping contexts (some terminals/code editors). That's an
  inherent OpenType limitation to communicate, not a bug to fix.

## Photo pipeline (when built)

- **Printed grid template, one glyph per box** — this is the whole trick. Known cell geometry after
  registration ⇒ deterministic crops, *no* OCR/segmentation (which is genuinely hard for cursive).
- **ArUco/AprilTag fiducial markers** in the corners → homography (`getPerspectiveTransform` /
  `warpPerspective`) → flatten the page. More robust than contour/corner detection.
- **Local adaptive thresholding** (Sauvola / `adaptiveThreshold`), never global Otsu — phone photos
  have uneven lighting/shadows.
- Print guides in **light cyan/gray** so they can be colour-filtered out of the crop.
- **Prototype in Python + `opencv-contrib-python`** (cv2.aruco works out of the box); port to a
  custom slim OpenCV.js build (stock build lacks the aruco module; WASM is ~6 MB) for the web app.

## Tracing (raster → vector)

- **Potrace** is the right tool — it produces filled **outline** contours (exactly what fonts want),
  not centerlines. Browser: `esm-potrace-wasm`. Node/Python: the C binary + `mkbitmap`.
- **Preprocessing dominates quality**: 2× supersample → threshold → despeckle before tracing.
- **⚠️ GPL-2.0 landmine:** Potrace and *all* its ports/WASM builds are GPL-2.0. For a closed,
  monetized product this must be resolved up front: (a) keep tracing behind a process/service
  boundary, (b) buy a commercial Potrace licence from the author, or (c) use permissive
  `imagetracerjs` and accept lower quality. The direct-draw mode avoids Potrace entirely
  (perfect-freehand is MIT) — another reason to ship draw mode first.

## Stack

- **SvelteKit + bun**, `@sveltejs/adapter-static`, deployed to **Cloudflare Pages**.
- Core logic lives in `src/lib/handwrite/` and is framework-agnostic so it can also power a CLI/API.
- Payments (when monetizing): **Lemon Squeezy / Paddle** as Merchant-of-Record (handles EU VAT).

## Correctness pitfalls — status after the adversarial review

- **Point-count bloat → ADDRESSED (Proof E).** `capture/simplify.ts` does RDP + a closed Catmull-Rom
  cubic fit; a noisy stroke drops 127→59 commands as smooth cubics. `fitEpsilon` is the fidelity dial.
- **Metrics → ADDRESSED (Proof E).** `font/metrics.ts` derives per-glyph advance width + side bearings
  from the ink bounding box (no more hardcoded 600); see `docs/spacing.svg`.
- Contour **winding / self-intersection** → single strokes are unioned via polygon-clipping (Proof C).
- ⚠️ **Multi-stroke letters & counters → STILL OPEN.** 't','i','=' (multiple strokes) and 'o','e','B'
  (counters) need *cross-stroke* winding reconciliation, not just per-stroke union. Moderate, solvable.
- ⚠️ **The big one → STILL OPEN.** None of this proves the output looks like a *real* person's hand.
  The proofs use synthetic (now noisy) strokes. The "is this me?" test with real humans is the
  kill-gate (see PLAN.md Phase 0.5).
