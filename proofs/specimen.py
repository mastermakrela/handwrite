#!/usr/bin/env python3
"""Render the actual glyph outlines from the proof fonts into one SVG specimen,
so the report can SHOW the letterforms we generated (proof that real glyphs exist).

Outputs docs/specimen.svg.
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "out")
DOCS = os.path.join(HERE, "..", "docs")

ROW_H = 110
PAD = 24
TARGET_CAP = 80  # px


def glyph_path(font, glyph_set, gname):
    pen = SVGPathPen(glyph_set)
    glyph_set[gname].draw(pen)
    return pen.getCommands(), glyph_set[gname].width


def render_glyphs(path, names_by_glyphname, color):
    """Return (svg_fragment, width) laying out the given glyph names on a baseline."""
    font = TTFont(path)
    upm = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    s = TARGET_CAP / 700.0  # capHeight≈700 in our proofs
    frags = []
    x = 0.0
    for gname in names_by_glyphname:
        d, adv = glyph_path(font, gs, gname)
        # font y-up -> svg y-down: translate to baseline, flip y
        frags.append(
            f'<g transform="translate({x:.1f},{TARGET_CAP:.1f}) scale({s:.4f},{-s:.4f})">'
            f'<path d="{d}" fill="{color}"/></g>'
        )
        x += adv * s + 6
    return "".join(frags), x


def labeled_row(y, label, fragment, width):
    return (
        f'<g transform="translate({PAD},{y})">'
        f'<text x="0" y="-10" font-family="ui-sans-serif,system-ui" font-size="12" fill="#7a8aa0">{label}</text>'
        f'<g transform="translate(0,8)">{fragment}</g>'
        f"</g>"
    )


rows = []
y = PAD + 24

# Proof A: HILOT
frag, w = render_glyphs(os.path.join(OUT, "proof-a.otf"), ["H", "I", "L", "O", "T"], "#1a1a2e")
rows.append(labeled_row(y, "Proof A · opentype.js .otf — lines, cubic curves, hollow counter (O)", frag, w))
y += ROW_H

# Proof C: the captured 'C' stroke
frag2, w2 = render_glyphs(os.path.join(OUT, "proof-c.otf"), ["C"], "#0b6e4f")
rows.append(labeled_row(y, "Proof C · pen stroke → perfect-freehand outline → glyph", frag2, w2))
y += ROW_H

# Proof B: the three cycling 'a' alternates
frag3, w3 = render_glyphs(os.path.join(OUT, "proof-b.ttf"), ["a", "a.calt1", "a.calt2"], "#b3541e")
rows.append(labeled_row(y, "Proof B · the 3 'calt' alternates HarfBuzz cycles through (a · a.calt1 · a.calt2)", frag3, w3))
y += ROW_H

total_h = y + PAD
total_w = max(420, int(max(w, w2, w3)) + PAD * 2)

svg = (
    f'<?xml version="1.0" encoding="UTF-8"?>\n'
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{total_h}" '
    f'viewBox="0 0 {total_w} {total_h}">'
    f'<rect width="{total_w}" height="{total_h}" fill="#fbfcfe"/>'
    + "".join(rows)
    + "</svg>\n"
)

os.makedirs(DOCS, exist_ok=True)
out_path = os.path.join(DOCS, "specimen.svg")
with open(out_path, "w") as f:
    f.write(svg)
print(f"wrote {os.path.normpath(out_path)} ({len(svg)} bytes)")
