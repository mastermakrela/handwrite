import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type PluginOption } from "vite";

/**
 * Dev-only: pipe browser console.* calls to the terminal over Vite's existing
 * HMR websocket (see src/hooks.client.ts for the browser side). Lets whoever is
 * watching this terminal see client-side logs without a browser console open.
 */
const browserLogger = (): PluginOption => ({
  name: "browser-logger",
  configureServer(server) {
    server.ws.on("browser:log", (data: { type: string; args: unknown[] }) => {
      if (!data || typeof data !== "object" || !Array.isArray(data.args)) return;
      const { type, args } = data;
      const prefix =
        {
          log: "\x1b[34m[browser]\x1b[0m",
          warn: "\x1b[33m[browser WARN]\x1b[0m",
          error: "\x1b[31m[browser ERROR]\x1b[0m",
        }[type] ?? "[browser]";
      console.log(prefix, ...args);
    });
  },
});

export default defineConfig({
  plugins: [
    // Single-page app deployed to Cloudflare Workers (static assets, no SSR).
    sveltekit({ preprocess: vitePreprocess(), adapter: adapter() }),
    browserLogger(),
  ],
});
