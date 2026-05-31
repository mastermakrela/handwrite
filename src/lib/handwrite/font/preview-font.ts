/**
 * Preview-font module: build the user's font in-browser from the current passes
 * and expose it for the live FontFace preview AND the .otf export from one source.
 *
 * `buildFontBytes` produces a Uint8Array of a real OTF (with the `calt` cycling
 * feature emitted by `buildFont`/`opentype-builder`). `registerPreviewFace`
 * loads those bytes through the FontFace API, swapping the previous face/URL so
 * the preview never shows stale glyphs and never leaks object URLs.
 *
 * Pure-data parts (buildFontBytes/buildGlyphs) run in Node/bun for headless tests;
 * the FontFace helpers are browser-only (guard `document`/`FontFace` at call site).
 */
import type { CharDef } from "$lib/handwrite/charsets";
import type { Pass } from "$lib/capture.svelte";
import { glyphsFromPasses, type BuildOpts } from "./glyph-from-passes";
import { buildFont, fontToUint8Array } from "./opentype-builder";
import { DEFAULT_METRICS, type GlyphDef } from "../types";

export const PREVIEW_FAMILY = "MyHandwritingPreview";
export type PenStroke = BuildOpts["stroke"];

/** Build the GlyphDefs (with alternates) for the given chars from all passes. */
export function buildGlyphs(passes: Pass[], chars: CharDef[], stroke?: PenStroke): GlyphDef[] {
  return glyphsFromPasses(passes, chars, stroke ? { stroke } : {});
}

export interface BuildBytesOptions {
  familyName?: string;
  styleName?: string;
  /** nib options (size/thinning/…); keeps the built font matching the on-screen ink */
  stroke?: PenStroke;
}

/**
 * Build the font and return both the parsed GlyphDefs and the serialized OTF
 * bytes. Single source of truth for preview + export.
 */
export function buildFontBytes(
  passes: Pass[],
  chars: CharDef[],
  opts: BuildBytesOptions = {},
): { glyphs: GlyphDef[]; bytes: Uint8Array } {
  const glyphs = buildGlyphs(passes, chars, opts.stroke);
  const font = buildFont({
    familyName: opts.familyName ?? "My Handwriting",
    styleName: opts.styleName ?? "Regular",
    ...DEFAULT_METRICS,
    glyphs,
  });
  return { glyphs, bytes: fontToUint8Array(font) };
}

/** A live FontFace registration that can be cleanly swapped/torn down. */
export interface PreviewFace {
  face: FontFace;
  url: string;
}

/**
 * Register (or refresh) the preview FontFace from OTF bytes. Removes the previous
 * face and revokes its object URL first so the browser doesn't serve stale glyphs
 * or leak URLs. Returns the new handle to keep in component state.
 *
 * Browser-only: requires `document.fonts` and `FontFace`/`URL`/`Blob`.
 */
export async function registerPreviewFace(
  bytes: Uint8Array,
  prev: PreviewFace | null,
  family: string = PREVIEW_FAMILY,
): Promise<PreviewFace> {
  disposePreviewFace(prev);

  // Copy into a fresh, standalone Uint8Array so Blob gets exactly the font bytes
  // (handles views with a non-zero byteOffset / shared buffers).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "font/otf" });
  const url = URL.createObjectURL(blob);
  const face = new FontFace(family, `url(${url})`);
  await face.load();
  document.fonts.add(face);
  return { face, url };
}

/** Remove a previously-registered preview face and revoke its object URL. */
export function disposePreviewFace(prev: PreviewFace | null): void {
  if (!prev) return;
  try {
    document.fonts.delete(prev.face);
  } catch {
    /* face may already be gone */
  }
  try {
    URL.revokeObjectURL(prev.url);
  } catch {
    /* url may already be revoked */
  }
}
