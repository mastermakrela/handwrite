// Bun imports .html files as bundled routes; give TS a type for the import.
declare module "*.html" {
  const html: import("bun").HTMLBundle;
  export default html;
}
