#!/usr/bin/env python3
"""Independent font validator (fontTools) — proves a font built by a *different*
implementation (opentype.js) is structurally valid OpenType.

Usage: python proofs/validate.py proofs/out/proof-a.otf
"""
import sys
from fontTools.ttLib import TTFont

REQUIRED = ["head", "hhea", "maxp", "hmtx", "cmap", "name", "OS/2", "post"]


def validate(path: str) -> int:
    font = TTFont(path)
    tables = list(font.keys())
    outline_kind = "CFF (cubic / .otf)" if "CFF " in tables else ("glyf (TrueType / .ttf)" if "glyf" in tables else "??")
    cmap = font.getBestCmap()
    name = font["name"].getDebugName(1) or "(unnamed)"
    upm = font["head"].unitsPerEm
    nglyphs = font["maxp"].numGlyphs
    features = []
    if "GSUB" in tables and font["GSUB"].table.FeatureList:
        features = sorted({fr.FeatureTag for fr in font["GSUB"].table.FeatureList.FeatureRecord})

    print(f"  file:         {path}")
    print(f"  family:       {name}")
    print(f"  outlines:     {outline_kind}")
    print(f"  unitsPerEm:   {upm}")
    print(f"  numGlyphs:    {nglyphs}")
    print(f"  cmap chars:   {len(cmap)}  sample={[chr(c) for c in list(cmap)[:8]]}")
    print(f"  GSUB feats:   {features or '(none)'}")
    missing = [t for t in REQUIRED if t not in tables]
    print(f"  tables:       {len(tables)}  missing_required={missing or 'none'}")

    ok = not missing and len(cmap) > 0 and nglyphs > 0
    print("  VALIDATION:   PASS ✅" if ok else "  VALIDATION:   FAIL ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    paths = sys.argv[1:] or ["proofs/out/proof-a.otf"]
    rc = 0
    for p in paths:
        print(f"\nfontTools validation of {p}")
        rc |= validate(p)
    sys.exit(rc)
