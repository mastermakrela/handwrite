/**
 * Font-assembly backend (browser-friendly, pure JS).
 *
 * Takes a `FontSpec` of normalized outlines and produces a real, downloadable
 * OpenType font using opentype.js 2.0.0.
 *
 * IMPORTANT (verified from opentype.js source, issue #594): opentype.js ALWAYS
 * writes CFF (cubic) outlines, i.e. a `.otf`. There is no glyf/TrueType writer.
 * A CFF `.otf` is a fully valid OpenType font and renders identically to `.ttf`
 * everywhere modern (browsers, VS Code, messaging, macOS/Windows).
 *
 * The `calt` (contextual alternates) variation feature is now emitted IN-BROWSER
 * here, by hand-authoring a GSUB table (type-1 single substitutions driven by
 * type-6 format-3 chain-context lookups) and assigning it to `font.tables.gsub`.
 * opentype.js serializes it on `toArrayBuffer()`. This runs in the browser and in
 * CF Workers (only ArrayBuffer/DataView/Uint8Array/Math). The downloaded `.otf`
 * and the live FontFace preview therefore share a single source of truth.
 */

import opentype from "opentype.js";
import type { FontSpec, GlyphDef, GlyphOutline } from "../types";

/** Convert our normalized outline (font units, y-up) into an opentype.js Path. */
export function outlineToPath(outline: GlyphOutline): opentype.Path {
  const path = new opentype.Path();
  for (const cmd of outline) {
    switch (cmd.type) {
      case "M":
        path.moveTo(cmd.x, cmd.y);
        break;
      case "L":
        path.lineTo(cmd.x, cmd.y);
        break;
      case "C":
        path.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        break;
      case "Q":
        path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
        break;
      case "Z":
        path.close();
        break;
    }
  }
  return path;
}

/**
 * Build one opentype.js Glyph PER alternate of a GlyphDef.
 *   - alternates[0] -> `def.name`, carries the unicode codepoint (default glyph).
 *   - alternates[k] (k>=1) -> `def.name + ".alt" + k`, NO unicode (reachable only
 *     via the calt feature).
 * All alternates share `def.advanceWidth` so cycling them doesn't jitter spacing.
 */
function makeGlyphs(def: GlyphDef): opentype.Glyph[] {
  return def.alternates.map((outline, k) =>
    new opentype.Glyph({
      name: k === 0 ? def.name : `${def.name}.alt${k}`,
      unicode: k === 0 ? def.codepoint : undefined,
      advanceWidth: def.advanceWidth,
      path: outlineToPath(outline ?? []),
    }),
  );
}

/**
 * Build an opentype.js Font from a FontSpec.
 * Always prepends the required `.notdef` glyph and ensures a `space` glyph.
 * Emits a `calt` GSUB feature that cycles each glyph's alternates (skipped when
 * no glyph has >=2 alternates, keeping the simplest valid font in the 1-round case).
 */
export function buildFont(spec: FontSpec): opentype.Font {
  const notdef = new opentype.Glyph({
    name: ".notdef",
    unicode: 0,
    advanceWidth: Math.round(spec.unitsPerEm * 0.5),
    path: new opentype.Path(),
  });

  const glyphs: opentype.Glyph[] = [notdef];

  const hasSpace = spec.glyphs.some((g) => g.codepoint === 0x20);
  if (!hasSpace) {
    glyphs.push(
      new opentype.Glyph({
        name: "space",
        unicode: 0x20,
        advanceWidth: Math.round(spec.unitsPerEm * 0.3),
        path: new opentype.Path(),
      }),
    );
  }

  for (const def of spec.glyphs) glyphs.push(...makeGlyphs(def));

  const font = new opentype.Font({
    familyName: spec.familyName,
    styleName: spec.styleName,
    unitsPerEm: spec.unitsPerEm,
    ascender: spec.ascender,
    descender: spec.descender,
    glyphs,
  });

  attachCaltGsub(font, spec.glyphs);

  return font;
}

/**
 * Hand-author a GSUB table that cycles alternates per glyph via `calt`.
 *
 * Verified opentype.js 2.0.0 chain: for each glyph with N>=2 variants
 * (base + alts), build N type-1 single-substitution lookups (base -> variant_k)
 * and ONE type-6 format-3 chain-context lookup whose subtables, ordered specific
 * first, map "previous output = variant_i, input = base" -> variant_{(i+1)%N},
 * plus a final empty-backtrack (start-of-run) subtable -> variant_1. The chain
 * lookup index is pushed into the `calt` feature. Pure: only touches `font.tables`.
 */
function attachCaltGsub(font: opentype.Font, defs: GlyphDef[]): void {
  // name -> glyph index, across the final glyph order.
  const gid: Record<string, number> = {};
  for (let i = 0; i < font.glyphs.length; i++) gid[font.glyphs.get(i).name] = i;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookups: any[] = [];
  const caltLookupIndexes: number[] = [];

  const addSingleSub = (fromGid: number, toGid: number): number => {
    const idx = lookups.length;
    lookups.push({
      lookupType: 1,
      lookupFlag: 0,
      subtables: [{ substFormat: 2, coverage: { format: 1, glyphs: [fromGid] }, substitute: [toGid] }],
    });
    return idx;
  };

  const addCycle = (baseName: string, altNames: string[]): void => {
    const variants = [baseName, ...altNames]; // v0 (base) .. v_{N-1}
    const N = variants.length;
    if (N < 2) return; // single outline — no cycling

    const baseGid = gid[baseName];
    // single-sub lookup that maps base -> variants[k], for every landing index k.
    const subTo: number[] = variants.map((name) => addSingleSub(baseGid, gid[name]));

    // chain subtables: prev = variants[i], input = base -> variants[(i+1)%N].
    // Specific prev-rules FIRST, generic start-of-run (empty backtrack) LAST.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chainSubtables: any[] = [];
    for (let i = 0; i < N; i++) {
      chainSubtables.push({
        substFormat: 3,
        backtrackCoverage: [{ format: 1, glyphs: [gid[variants[i]]] }],
        inputCoverage: [{ format: 1, glyphs: [baseGid] }],
        lookaheadCoverage: [],
        lookupRecords: [{ sequenceIndex: 0, lookupListIndex: subTo[(i + 1) % N] }],
      });
    }
    chainSubtables.push({
      substFormat: 3,
      backtrackCoverage: [],
      inputCoverage: [{ format: 1, glyphs: [baseGid] }],
      lookaheadCoverage: [],
      lookupRecords: [{ sequenceIndex: 0, lookupListIndex: subTo[1] }],
    });

    const chainLookupIndex = lookups.length;
    lookups.push({ lookupType: 6, lookupFlag: 0, subtables: chainSubtables });
    caltLookupIndexes.push(chainLookupIndex);
  };

  for (const def of defs) {
    if (def.alternates.length < 2) continue;
    const altNames = def.alternates.slice(1).map((_, k) => `${def.name}.alt${k + 1}`);
    addCycle(def.name, altNames);
  }

  // Skip GSUB entirely when nothing cycles — keeps the simplest valid font.
  if (lookups.length === 0) return;

  const defaultLangSys = { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0] };
  // opentype.js type defs don't declare `tables.gsub`; assign loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (font.tables as any).gsub = {
    version: 1,
    scripts: [
      { tag: "DFLT", script: { defaultLangSys, langSysRecords: [] } },
      { tag: "latn", script: { defaultLangSys, langSysRecords: [] } },
    ],
    features: [{ tag: "calt", feature: { featureParams: 0, lookupListIndexes: caltLookupIndexes } }],
    lookups,
  };
}

/** Serialize a built font to bytes (works in Node/bun and the browser). */
export function fontToUint8Array(font: opentype.Font): Uint8Array {
  return new Uint8Array(font.toArrayBuffer());
}
