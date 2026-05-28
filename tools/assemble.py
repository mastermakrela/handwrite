#!/usr/bin/env python3
"""Assemble a font (CFF .otf + .woff2) from an outlines interchange JSON, wiring
a `calt` feature that cycles each character's alternates for natural variation.

  python tools/assemble.py tools/_outlines.json [outdir]

Interchange JSON:
  { familyName, unitsPerEm, ascender, descender,
    glyphs: [ { name, codepoint, advanceWidth, alternates: [ [ ["M",x,y],["C",...],["Z"] ], ... ] } ] }
Alternates[0] is the default (cmap'd) glyph; the rest are reached only via calt.
"""
import json, os, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.t2CharStringPen import T2CharStringPen

data = json.load(open(sys.argv[1]))
outdir = sys.argv[2] if len(sys.argv) > 2 else "."
upm, asc, desc = data["unitsPerEm"], data["ascender"], data["descender"]


def charstring(cmds, advance):
    pen = T2CharStringPen(advance, None)
    for cmd in cmds:
        t = cmd[0]
        if t == "M": pen.moveTo((cmd[1], cmd[2]))
        elif t == "L": pen.lineTo((cmd[1], cmd[2]))
        elif t == "C": pen.curveTo((cmd[1], cmd[2]), (cmd[3], cmd[4]), (cmd[5], cmd[6]))
        elif t == "Z": pen.closePath()
    return pen.getCharString()


glyph_order = [".notdef", "space"]
cmap = {0x20: "space"}
charstrings = {".notdef": T2CharStringPen(round(upm * 0.5), None).getCharString(),
               "space": T2CharStringPen(round(upm * 0.3), None).getCharString()}
metrics = {".notdef": (round(upm * 0.5), 0), "space": (round(upm * 0.3), 0)}
fea_rules = []

for g in data["glyphs"]:
    base, adv, alts = g["name"], g["advanceWidth"], g["alternates"]
    names = []
    for i, outline in enumerate(alts):
        gname = base if i == 0 else f"{base}.alt{i}"
        charstrings[gname] = charstring(outline, adv)
        metrics[gname] = (adv, 0)
        glyph_order.append(gname)
        names.append(gname)
    cmap[g["codepoint"]] = base
    if len(names) >= 2:  # deterministic cycle base -> alt1 -> ... -> base
        for i in range(len(names)):
            fea_rules.append(f"    sub {names[i]} {base}' by {names[(i + 1) % len(names)]};")

fb = FontBuilder(upm, isTTF=False)
fb.setupGlyphOrder(glyph_order)
fb.setupCharacterMap(cmap)
fb.setupCFF(data["familyName"].replace(" ", ""), {"FullName": data["familyName"]}, charstrings, {})
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=asc, descent=desc)
fb.setupNameTable({"familyName": data["familyName"], "styleName": "Regular"})
fb.setupOS2(sTypoAscender=asc, sTypoDescender=desc, usWinAscent=asc, usWinDescent=-desc, sxHeight=500, sCapHeight=700)
fb.setupPost()
if fea_rules:
    addOpenTypeFeaturesFromString(fb.font, "feature calt {\n" + "\n".join(fea_rules) + "\n} calt;\n")

os.makedirs(outdir, exist_ok=True)
otf = os.path.join(outdir, "MyHandwriting.otf")
woff2 = os.path.join(outdir, "MyHandwriting.woff2")
fb.save(otf)
fb.font.flavor = "woff2"
fb.font.save(woff2)
print(json.dumps({"otf": otf, "woff2": woff2, "glyphs": len(glyph_order), "caltRules": len(fea_rules),
                  "varied": len(fea_rules) > 0}))
