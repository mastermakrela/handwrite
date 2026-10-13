/** Smoke test: the import guard accepts real exports and rejects shapes that would break the app. */
import { isPassList } from "../src/lib/handwrite/font/glyph-from-passes";

const stroke = [{ x: 1, y: 2, pressure: 0.5 }, { x: 3, y: 4 }];
const cases: [string, unknown, boolean][] = [
  ["real export", [{ a: [stroke] }, {}], true],
  ["empty list", [], false],
  ["null round", [null], false],
  ["number round", [1], false],
  ["round is an array", [[stroke]], false],
  ["strokes not an array", [{ a: 5 }], false],
  ["point without y", [{ a: [[{ x: 1 }]] }], false],
  ["NaN coordinate", [{ a: [[{ x: NaN, y: 1 }]] }], false],
];

let ok = true;
console.log("SMOKE — import guard");
for (const [name, input, want] of cases) {
  const got = isPassList(input);
  if (got !== want) ok = false;
  console.log(`  ${name.padEnd(22)}${got === want ? "OK ✅" : `FAIL ❌ (got ${got})`}`);
}
console.log(ok ? "  RESULT: PASS ✅" : "  RESULT: FAIL ❌");
process.exit(ok ? 0 : 1);
