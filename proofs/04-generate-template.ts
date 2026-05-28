/**
 * PROOF D — Calibration template generator (front-end of the photo pipeline).
 *
 * Produces a printable A4 SVG: a grid with one box per character, baseline +
 * x-height guides inside each cell, a faint label, and FOUR corner registration
 * markers. The user prints it, writes one glyph per box, photographs it; the CV
 * pipeline detects the corner markers, computes a homography to flatten the page,
 * and then crops each cell by KNOWN geometry (no OCR, no segmentation).
 *
 * NOTE: the corner markers here are nested-square FINDER patterns as a stand-in.
 * Production should print real ArUco/AprilTag markers (unique IDs => robust,
 * unambiguous orientation). The cell geometry math below is exactly what the
 * decoder re-uses after warping the photo to canonical coordinates.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// A4 at 96dpi-ish canonical units.
const PAGE = { w: 794, h: 1123, margin: 56 };
const MARKER = 48; // corner marker size
const COLS = 8;
const GUIDE = "#cfe0ee"; // light cyan-ish so it can be colour-filtered out of the photo

const CHARSET = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  ..."., ' \" ! ? - : ; ( )".split(" ").filter(Boolean),
];

/** A nested-square finder pattern (ArUco placeholder) at a corner. */
function marker(x: number, y: number): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${MARKER}" height="${MARKER}" fill="#111"/>
      <rect x="${x + 8}" y="${y + 8}" width="${MARKER - 16}" height="${MARKER - 16}" fill="#fff"/>
      <rect x="${x + 16}" y="${y + 16}" width="${MARKER - 32}" height="${MARKER - 32}" fill="#111"/>
    </g>`;
}

function cell(x: number, y: number, w: number, h: number, label: string): string {
  const baseline = y + h * 0.78;
  const xheight = y + h * 0.45;
  const esc = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${GUIDE}" stroke-width="1"/>
      <line x1="${x}" y1="${baseline}" x2="${x + w}" y2="${baseline}" stroke="${GUIDE}" stroke-width="1.5"/>
      <line x1="${x}" y1="${xheight}" x2="${x + w}" y2="${xheight}" stroke="${GUIDE}" stroke-width="1" stroke-dasharray="3 3"/>
      <text x="${x + 4}" y="${y + 14}" font-family="monospace" font-size="11" fill="#9fb3c8">${esc}</text>
    </g>`;
}

function generateTemplate(): string {
  const innerW = PAGE.w - PAGE.margin * 2;
  const cellW = innerW / COLS;
  const cellH = cellW * 1.15;
  const gridTop = PAGE.margin + MARKER + 24;

  const cells: string[] = [];
  CHARSET.forEach((ch, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    cells.push(cell(PAGE.margin + col * cellW, gridTop + row * cellH, cellW, cellH, ch));
  });

  const markers = [
    marker(PAGE.margin, PAGE.margin),
    marker(PAGE.w - PAGE.margin - MARKER, PAGE.margin),
    marker(PAGE.margin, PAGE.h - PAGE.margin - MARKER),
    marker(PAGE.w - PAGE.margin - MARKER, PAGE.h - PAGE.margin - MARKER),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}" height="${PAGE.h}" viewBox="0 0 ${PAGE.w} ${PAGE.h}">
  <rect width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>
  <text x="${PAGE.margin}" y="${PAGE.margin - 10}" font-family="sans-serif" font-size="14" fill="#333">handwrite · calibration sheet — write ONE character per box, fine black pen</text>
  ${markers.join("")}
  ${cells.join("")}
</svg>`;
}

const svg = generateTemplate();
const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "template.svg");
writeFileSync(outPath, svg);

console.log("PROOF D — calibration template");
console.log("  wrote:        ", outPath, `(${svg.length} bytes)`);
console.log("  characters:   ", CHARSET.length, "cells");
console.log("  markers:      ", "4 corner finder patterns (ArUco placeholders)");
console.log("  RESULT: PASS ✅ (printable calibration sheet generated)");
