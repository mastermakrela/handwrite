/**
 * Dev-only: mirror browser console.log/warn/error to the terminal running Vite
 * (handled by the `browser-logger` plugin in vite.config.ts). Normal console
 * calls still appear in the browser too — no code changes needed at call sites.
 */
if (import.meta.hot) {
  const hot = import.meta.hot;
  const original = { log: console.log, warn: console.warn, error: console.error };

  const serialize = (args: unknown[]) =>
    args.map((arg) => {
      if (arg instanceof Error) return { message: arg.message, stack: arg.stack };
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.parse(JSON.stringify(arg));
        } catch {
          return "[Circular/Unserializable Object]";
        }
      }
      return arg;
    });

  const patch = (type: "log" | "warn" | "error") => {
    console[type] = (...args: unknown[]) => {
      original[type](...args);
      try {
        hot.send("browser:log", { type, args: serialize(args) });
      } catch {
        /* socket not ready / send failed — keep the browser log regardless */
      }
    };
  };

  patch("log");
  patch("warn");
  patch("error");
}
