/**
 * The type-safe authoring surface for JSX composition contracts (ADR 0003). It
 * compiles to the plugin's rule table and types itself against it, carrying no
 * runtime dependency on the plugin.
 */
export * from "./surface/index.js";
