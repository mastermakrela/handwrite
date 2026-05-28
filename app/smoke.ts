/**
 * Headless smoke test of the capture app SOURCE: init the grid, draw into the
 * 'a' cell, click Build .otf, validate the font parses. (Pencil itself can't be
 * tested here; the pointer wiring is conventional.)
 */
import opentype from "opentype.js";
import { installDom, simulateStroke, type El } from "./_domshim";

const dom = installDom();
await import("./capture-app.ts");

const grid = dom.els.grid;
const initOk = grid.children.length > 0 && dom.els.count.textContent.includes("/");

const cells = (globalThis as any).__cells as Map<string, { canvas: El }>;
const aCell = cells?.get("a");
if (aCell) simulateStroke(aCell.canvas);
dom.els.build.click();

const blob = dom.getCaptured();
let parseOk = false, n = 0;
if (blob) { const f = opentype.parse(await blob.arrayBuffer()); n = f.glyphs.length; parseOk = !!f.charToGlyph("a") && n >= 2; }

console.log("SMOKE — capture app (source)");
console.log("  grid built:     ", initOk ? `OK ✅ (${grid.children.length} nodes, count='${dom.els.count.textContent}')` : "FAIL ❌");
console.log("  cells exposed:  ", cells ? `OK ✅ (${cells.size})` : "FAIL ❌");
console.log("  draw 'a' + build:", parseOk ? `OK ✅ (${n} glyphs)` : "FAIL ❌");
const ok = initOk && !!cells && parseOk;
console.log(ok ? "  RESULT: PASS ✅" : "  RESULT: FAIL ❌");
process.exit(ok ? 0 : 1);
