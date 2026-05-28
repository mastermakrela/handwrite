#!/usr/bin/env python3
"""Process a REAL, non-grid photo of cursive handwriting (../../Image.jpeg).
Shows how far classical CV gets and where it hits the cursive wall.
Saves /tmp/hw_*.png and /tmp/hw_traced.svg for inspection.
"""
import cv2
import numpy as np
import os
import potrace

SRC = os.path.join(os.path.dirname(__file__), "..", "..", "Image.jpeg")
img = cv2.rotate(cv2.imread(SRC), cv2.ROTATE_90_CLOCKWISE)  # make the line horizontal

# 1) paper = largest bright blob
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
_, bright = cv2.threshold(gray, 140, 255, cv2.THRESH_BINARY)
bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8), iterations=2)
cnts, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
x, y, w, h = cv2.boundingRect(max(cnts, key=cv2.contourArea))
p = 12
crop = img[y + p : y + h - p, x + p : x + w - p]
cv2.imwrite("/tmp/hw_crop.png", crop)

# 2) isolate the blue ink by SATURATION (colored ink vs white paper) — robust to lighting
hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
sat = hsv[:, :, 1]
ink = cv2.threshold(sat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
cv2.imwrite("/tmp/hw_ink.png", ink)

# 3) connected components — in cursive these are word/ligature runs, NOT letters
merged = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)), 1)
n, labels, stats, _ = cv2.connectedComponentsWithStats(merged)
boxes = sorted(
    [s for s in stats[1:] if s[cv2.CC_STAT_AREA] > 600 and s[cv2.CC_STAT_WIDTH] > 25],
    key=lambda s: s[cv2.CC_STAT_LEFT],
)
vis = crop.copy()
for s in boxes:
    bx, by, bw, bh = s[1], s[2], s[3], s[4]
    cv2.rectangle(vis, (bx, by), (bx + bw, by + bh), (0, 0, 255), 4)
cv2.imwrite("/tmp/hw_segmented.png", vis)

# 4) VECTORIZE the ink with Potrace -> proves real ink -> smooth Bezier outlines works
bmp = potrace.Bitmap((ink > 0))
path = bmp.trace(turdsize=20, alphamax=1.0)
parts = []
for curve in path:
    s = curve.start_point
    d = [f"M{s.x:.1f} {s.y:.1f}"]
    for seg in curve.segments:
        e = seg.end_point
        if seg.is_corner:
            c = seg.c
            d.append(f"L{c.x:.1f} {c.y:.1f} L{e.x:.1f} {e.y:.1f}")
        else:
            c1, c2 = seg.c1, seg.c2
            d.append(f"C{c1.x:.1f} {c1.y:.1f} {c2.x:.1f} {c2.y:.1f} {e.x:.1f} {e.y:.1f}")
    d.append("Z")
    parts.append(" ".join(d))
svg = (
    f'<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="{ink.shape[1]}" '
    f'height="{ink.shape[0]}" viewBox="0 0 {ink.shape[1]} {ink.shape[0]}">'
    f'<rect width="100%" height="100%" fill="#fff"/>'
    f'<path d="{" ".join(parts)}" fill="#2b2f8f" fill-rule="evenodd"/></svg>\n'
)
open("/tmp/hw_traced.svg", "w").write(svg)

ink_px = int((ink > 0).sum())
print(f"paper crop:        {crop.shape[1]}x{crop.shape[0]}")
print(f"ink pixels found:  {ink_px:,}")
print(f"word/ligature runs (NOT letters): {len(boxes)}")
print(f"vectorized into {len(list(path))} Potrace contours -> /tmp/hw_traced.svg")
print("saved: /tmp/hw_crop.png /tmp/hw_ink.png /tmp/hw_segmented.png /tmp/hw_traced.svg")
