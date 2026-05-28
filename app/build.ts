/**
 * Bundle the capture app and embed it into ONE self-contained offline .html
 * (for AirDrop / sharing). `index.html` is the single source of truth for the UI;
 * here we swap its <script src="./capture-app.ts"> for an inlined bundle.
 *
 *   bun run capture:build   ->   handwrite-capture.html
 *
 * We inline as a CLASSIC <script> built in IIFE format, NOT <script type="module">:
 * ES modules forbid the HTML-comment tokens `<!--` / `-->`, and minifiers emit
 * `-->` from `i-- > 0`. Classic scripts parse `-->` mid-line as `-- >`, so it's safe.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const built = await Bun.build({
  entrypoints: [join(here, "capture-app.ts")],
  target: "browser",
  format: "iife",
  minify: true,
});
if (!built.success) {
  for (const log of built.logs) console.error(log);
  process.exit(1);
}
let js = await built.outputs[0].text();
js = js.replaceAll("</script", "<\\/script"); // never close the tag early

const htmlOpen = (js.match(/<!--/g) || []).length;
const lineStartClose = (js.match(/(^|\n)\s*-->/g) || []).length;
console.log(`bundle checks: format=iife · "<!--"=${htmlOpen} · line-start "-->"=${lineStartClose}`);
if (htmlOpen > 0 || lineStartClose > 0) { console.error("UNSAFE sequence for a classic inline script — aborting."); process.exit(1); }

const template = await Bun.file(join(here, "index.html")).text();
const SRC_TAG = '<script type="module" src="./capture-app.ts"></script>';
if (!template.includes(SRC_TAG)) { console.error(`couldn't find ${SRC_TAG} in index.html`); process.exit(1); }
const scriptTag = `<script>\n${js}\n</script>`;
const html = template.replace(SRC_TAG, () => scriptTag); // fn replacer: don't interpret `$` in minified JS

const out = join(root, "handwrite-capture.html");
await Bun.write(out, html);
console.log(`wrote ${out}`);
console.log(`  bundle: ${(js.length / 1024).toFixed(0)} KB · total html: ${(html.length / 1024).toFixed(0)} KB`);
