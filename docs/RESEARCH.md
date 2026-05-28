# Research findings (web-verified, May 2026)

Eight parallel research agents, each verifying current library state via web search. Verdict scale:
**FEASIBLE_NOW** · **FEASIBLE_HARD** · **RISKY** · **AVOID**.

## 1. Font generation libraries — FEASIBLE_NOW
The font binary is the *easy* part. **opentype.js 2.0.0** (May 2026) builds a font from scratch in
the browser and downloads it — but writes **CFF `.otf` only** (no glyf/TrueType writer; issue #594).
A CFF `.otf` is valid and renders identically to `.ttf` everywhere modern. For a literal `.ttf`,
`.woff2`, or `calt` features, use **fontTools 4.63.0** (`FontBuilder` + `feaLib`). `fontkit` is
read/subset-only (not a generator). `svg2ttf 6.1.0` is the all-JS escape hatch for real `.ttf`.

## 2. Raster → vector tracing — FEASIBLE_NOW (⚠️ GPL)
**Potrace 1.16** is the gold standard; it produces filled **outline** contours (what fonts want),
not centerlines. Browser: **`esm-potrace-wasm` 0.4.4** (runs real Potrace in WASM). Node: `potrace`
npm / `oslllo-potrace`. Python: C binary + `mkbitmap`, or pure-Python `potracer`. **Preprocessing
(2× supersample → threshold → despeckle) dominates quality.** **All Potrace ports are GPL-2.0** —
a real risk for a closed product. Permissive but lower-quality alternative: `imagetracerjs`.

## 3. Photo CV pipeline — FEASIBLE_NOW (with a grid)
Feasible **only** with a printed **grid template, one glyph per box** (the Calligraphr trick) — known
cell geometry ⇒ deterministic crops, no OCR/segmentation. Register with **ArUco/AprilTag** fiducials
→ homography → flatten. Binarize with **local adaptive** methods (Sauvola / `adaptiveThreshold`),
never global Otsu (phone shadows). **OpenCV.js** can do it in-browser but the **stock build lacks the
aruco module** and the WASM is ~6 MB → custom slim build or a Python `opencv-contrib-python` backend.
Prototype in Python (cv2.aruco works out of the box), port later.

## 4. Competitors — RISKY (crowded)
**Calligraphr** is the entrenched leader: template-from-photo (smartphone OK, corner markers + auto-
skew), TTF/OTF, randomization, ligatures; free tier 75 chars / 2 variants, Pro ~€6–10. **iFontMaker**
($7.99, iPad). The live AI threat is **Lipi.ai** — operational, no-template freeform-photo, marketplace
+ API, $4.99–7.99. Open-source prior art: **builtree/handwrite** (Potrace+FontForge, MIT, stale) — same
name. **Differentiation that's NOT well-served:** on-device privacy, developer tooling (CLI/API,
monospaced coding font), and variation/cursive quality. *Stress-test Lipi.ai with messy handwriting
before assuming differentiation.*

## 5. Variation & variable fonts — FEASIBLE_NOW
Use **multiple alternates + deterministic `calt` cycling** (Caveat/Liza technique). **Variable-font
interpolation is ruled out** (masters must be point-compatible; autotraced glyphs never are). **`rand`
is ruled out** (unsupported in Safari/CoreText; reflows text every load). `calt` is the most reliably
supported web feature (on by default in Safari; needs `font-feature-settings:'calt' 1` in Chrome/FF).
Average multiple samples in **bitmap** space (median/best-pick) before tracing, never in vector space.
Authoring `calt` requires **Python fontTools** — no JS lib writes GSUB.

## 6. Cursive + ML synthesis — FEASIBLE_HARD (defer)
Drop both for the prototype. Use a **separated-box template**; fake "connectedness" later at the font
level (calt + ligatures / GPOS cursive anchors via fontTools — Playwrite is the reference). Segmenting
connected cursive from a photo is **unsolved in general**. ML font generation (DeepVecFont-v2,
FontDiffuser, DG-Font) is **research-grade, CJK-focused, GPU-bound** — not credible for Latin
handwriting now. For missing glyphs: require the user to write them; fill gaps with combining marks /
interpolation before any ML.

## 7. Apple Pencil direct-draw — FEASIBLE_NOW (easiest)
Pure browser, no native code. **PointerEvents** expose pen pressure/tilt; **`getCoalescedEvents()`**
shipped in **iOS Safari 18.2** (Dec 2024, ~93% global) for smooth high-frequency sampling;
`touch-action:none` fully supported. **`perfect-freehand` 1.2.3** turns pressure-aware points into a
closed variable-width **outline = glyph contour** (MIT, no GPL). Must **flatten self-intersections**
(polygon-clipping) and simplify point counts. **opentype.js** writes the font. Recommendation:
**start the prototype here** to prove the font half cheaply, then add the photo pipeline.

## 8. Legal / privacy / deploy — FEASIBLE_NOW
US: letterform *shapes* aren't copyrightable, but the **font file is** (software) — the user owns their
export. EU: the design is also protectable ("your handwriting, your IP"). **On-device processing** ⇒
GDPR-light (user is sole controller; not "biometric" because not used to identify) + a real privacy
differentiator. **Cloudflare Pages free tier**: unlimited bandwidth, commercial use allowed (Vercel
Hobby bans commercial use). Monetize with a **one-time ~€8–12 export unlock**; **Lemon Squeezy / Paddle**
as Merchant-of-Record for EU VAT.

---
*Full source lists per dimension are in the research transcript; the report (`report.html`) carries the
load-bearing citations.*
