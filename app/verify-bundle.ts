/**
 * Verify the SHIPPED artifact: extract the <script> from handwrite-capture.html
 * and actually execute it against the DOM shim, then draw + Build .otf. Catches
 * inlining/bundling bugs a source-level test can't (e.g. the module <!-- --> issue).
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { installDom, simulateStroke, type El } from "./_domshim";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await Bun.file(join(root, "handwrite-capture.html")).text();
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("no <script> found in handwrite-capture.html"); process.exit(1); }
const bundle = m[1].replaceAll("<\\/script", "</script");

const dom = installDom();
let ran = true;
try { (0, eval)(bundle); } catch (e) { ran = false; console.error("  bundle threw:", e); }

const grid = dom.els.grid;
const initOk = ran && grid.children.length > 0 && dom.els.count.textContent.includes("/");
const cells = (globalThis as any).__cells as Map<string, { canvas: El }>;
const aCell = cells?.get("a");
if (aCell) simulateStroke(aCell.canvas);
dom.els.build.click();

const blob = dom.getCaptured();
let parseOk = false, n = 0;
if (blob) { const f = opentype.parse(await blob.arrayBuffer()); n = f.glyphs.length; parseOk = !!f.charToGlyph("a") && n >= 2; }

console.log("VERIFY shipped handwrite-capture.html");
console.log("  bundle executes:", ran ? "OK ✅" : "FAIL ❌");
console.log("  grid built:     ", initOk ? `OK ✅ (${grid.children.length} nodes)` : "FAIL ❌");
console.log("  draw + build:   ", parseOk ? `OK ✅ (${n} glyphs)` : "FAIL ❌");
const ok = initOk && parseOk;
console.log(ok ? "  RESULT: PASS ✅ (the file the iPad loads actually works)" : "  RESULT: FAIL ❌");
process.exit(ok ? 0 : 1);
