/**
 * Tiny DOM shim so the capture app's logic can be exercised headlessly in bun
 * (we can't run Apple Pencil here, but we can verify init + draw + build-font).
 */
export class El {
  tagName = ""; className = ""; textContent = ""; value = ""; href = ""; download = "";
  style: any = {}; files: any[] = []; children: El[] = [];
  classList = { add() {}, remove() {}, toggle() {} };
  handlers: Record<string, ((e: any) => void)[]> = {};
  width = 128; height = 128;
  addEventListener(t: string, fn: (e: any) => void) { (this.handlers[t] ??= []).push(fn); }
  fire(t: string, e: any) { for (const h of this.handlers[t] || []) h(e); }
  append(...kids: El[]) { this.children.push(...kids); }
  appendChild(k: El) { this.children.push(k); return k; }
  click() { this.fire("click", {}); }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 128, height: 128 }; }
  getContext() { return new Proxy({}, { get: () => () => {} }); }
}

export function installDom() {
  const els: Record<string, El> = {};
  for (const id of ["grid", "count", "build", "json", "import"]) els[id] = new El();
  let captured: Blob | null = null;
  const g: any = globalThis;
  const doc = new El(); // El gives document.addEventListener (used for gesture-zoom blocking)
  (doc as any).getElementById = (id: string) => (els[id] ??= new El());
  (doc as any).createElement = (tag: string) => { const e = new El(); e.tagName = tag; return e; };
  g.document = doc;
  g.window = g; g.self = g; g.navigator = { userAgent: "node" }; g.devicePixelRatio = 2;
  g.addEventListener = () => {};
  g.requestAnimationFrame = (fn: any) => { fn(); return 0; };
  g.cancelAnimationFrame = () => {};
  g.alert = (m: string) => console.log("  [alert]", m);
  const store = new Map<string, string>();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  g.Path2D = class { moveTo() {} lineTo() {} closePath() {} };
  g.URL.createObjectURL = (b: Blob) => { captured = b; return "blob:x"; };
  g.URL.revokeObjectURL = () => {};
  return { els, store, getCaptured: () => captured };
}

/** Fire a curved pointer stroke inside a 128×128 cell canvas. */
export function simulateStroke(canvas: El) {
  const pts: any[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 1.7;
    pts.push({ clientX: 64 + 45 * Math.cos(a), clientY: 64 + 45 * Math.sin(a), pressure: 0.6, pointerId: 1, pointerType: "pen", preventDefault() {} });
  }
  canvas.fire("pointerdown", pts[0]);
  for (let i = 1; i < pts.length; i++) canvas.fire("pointermove", pts[i]);
  canvas.fire("pointerup", pts[pts.length - 1]);
}
