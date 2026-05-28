/**
 * Bun fullstack dev server — replaces `python -m http.server`.
 * Bundles index.html's <script> (capture-app.ts) on the fly, with HMR, and serves
 * on the LAN so the iPad can reach it.
 *
 *   bun run dev   ->   open the printed iPad URL in Safari on the same Wi-Fi
 */
import { networkInterfaces } from "node:os";
import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);
const server = Bun.serve({
  port,
  hostname: "0.0.0.0", // reachable from the iPad, not just localhost
  development: true, // live bundling + HMR + error overlay
  routes: {
    "/": index,
    "/favicon.ico": new Response(null, { status: 204 }),
  },
});

const lan =
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? "localhost";

console.log("handwrite capture — Bun dev server (HMR on)");
console.log(`  local:  http://localhost:${server.port}`);
console.log(`  iPad:   http://${lan}:${server.port}   (same Wi-Fi)`);
