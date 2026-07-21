/**
 * The type-safe authoring surface for JSX composition contracts (ADR 0003):
 * `defineContracts` and the `contract(name, from)` primitive it injects,
 * `mergeContracts`, `findUnsatisfiable`, and the condition constructors. The
 * package compiles to the plugin's v2 rule table, which it types itself
 * against — it carries no runtime dependency on the plugin.
 */
export * from "./v2/index.js";
