#!/usr/bin/env python3
"""PROOF B — "Can we get a *real* .ttf + .woff2 AND natural per-letter variation?"

This proves the two things opentype.js canNOT do, which the product needs:
  1. a genuine glyf / TrueType `.ttf` (and a `.woff2` for the web), via fontTools FontBuilder
  2. the "every letter looks different" effect via an OpenType `calt` (contextual
     alternates) feature that deterministically CYCLES through alternate glyphs
     — the Caveat/Liza technique, NOT variable fonts and NOT the `rand` feature.

We build a tiny font where the letter 'a' has 3 alternates, wire up a calt cycler,
then SHAPE the string "aaaaa" with HarfBuzz to show the glyph sequence rotates:
    a -> a.calt1 -> a.calt2 -> a -> a.calt1
That rotation is the whole feature, proven end to end.
"""
import os
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

UPM = 1000
ASC, DESC = 800, -200
OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

GLYPH_ORDER = [".notdef", "space", "a", "a.calt1", "a.calt2"]
CMAP = {0x20: "space", 0x61: "a"}  # alternates are reachable ONLY via calt


def box(pen, x0, y0, x1, y1):
    pen.moveTo((x0, y0))
    pen.lineTo((x0, y1))
    pen.lineTo((x1, y1))
    pen.lineTo((x1, y0))
    pen.closePath()


def glyph(*boxes):
    pen = TTGlyphPen(None)
    for b in boxes:
        box(pen, *b)
    return pen.glyph()


# Three visibly-distinct 'a' shapes (shape doesn't matter for the proof — only
# that they are different glyphs the shaper can rotate through).
glyphs = {
    ".notdef": glyph((50, 0, 450, 700)),
    "space": glyph(),
    "a": glyph((100, 0, 500, 500)),                       # plain block
    "a.calt1": glyph((100, 0, 500, 500), (150, 520, 300, 640)),  # block + left tick
    "a.calt2": glyph((100, 0, 500, 500), (300, 520, 450, 640)),  # block + right tick
}
metrics = {name: (600, 80) for name in GLYPH_ORDER}  # (advanceWidth, lsb)

fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(GLYPH_ORDER)
fb.setupCharacterMap(CMAP)
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=ASC, descent=DESC)
fb.setupNameTable({"familyName": "Handwrite Proof B", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=ASC, sTypoDescender=DESC, usWinAscent=ASC, usWinDescent=-DESC)
fb.setupPost()

# Deterministic pseudo-random cycler: each 'a' looks at the PREVIOUS glyph and
# advances to the next alternate. Because the shaper rewrites glyphs left-to-right
# and the backtrack context sees the rewritten glyph, this rotates stably and
# never reflows (unlike `rand`).
FEA = """
feature calt {
    sub a       a' by a.calt1;
    sub a.calt1 a' by a.calt2;
    sub a.calt2 a' by a;
} calt;
"""
addOpenTypeFeaturesFromString(fb.font, FEA)

ttf_path = os.path.join(OUT, "proof-b.ttf")
woff2_path = os.path.join(OUT, "proof-b.woff2")
fb.save(ttf_path)
fb.font.flavor = "woff2"
fb.font.save(woff2_path)

print("PROOF B — fontTools TTF + calt variation + woff2")
print(f"  wrote TTF:    {ttf_path} ({os.path.getsize(ttf_path)} bytes)")
print(f"  wrote WOFF2:  {woff2_path} ({os.path.getsize(woff2_path)} bytes)")

# --- confirm the GSUB/calt is really in the TTF -----------------------------
check = TTFont(ttf_path)
feats = sorted({fr.FeatureTag for fr in check["GSUB"].table.FeatureList.FeatureRecord})
is_ttf = "glyf" in check.keys()
print(f"  outlines:     {'glyf (real TrueType .ttf) ✅' if is_ttf else 'NOT glyf ❌'}")
print(f"  GSUB feats:   {feats}")

# --- shape "aaaaa" through HarfBuzz: the glyphs must ROTATE ------------------
import uharfbuzz as hb  # noqa: E402

blob = hb.Blob.from_file_path(ttf_path)
hbfont = hb.Font(hb.Face(blob))
buf = hb.Buffer()
buf.add_str("aaaaa")
buf.guess_segment_properties()
hb.shape(hbfont, buf, {"calt": True})
seq = [GLYPH_ORDER[info.codepoint] for info in buf.glyph_infos]
print(f"  shape 'aaaaa' -> {seq}")

expected = ["a", "a.calt1", "a.calt2", "a", "a.calt1"]
ok = is_ttf and "calt" in feats and seq == expected
print("  RESULT: PASS ✅ (real TTF + woff2 + calt cycles)" if ok
      else f"  RESULT: FAIL ❌ (expected {expected})")
sys.exit(0 if ok else 1)
