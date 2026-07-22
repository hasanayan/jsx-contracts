/**
 * `@jsx-contracts/storybook` — the `ContractDocs` doc block (ADR 0006). One thin
 * component, explicit props, peer deps on React and Storybook only. No addon, no
 * resolver, no configuration surface: everything React-flavoured lives here so
 * Storybook's release cadence never drives authoring releases.
 */

export { ContractDocs } from "./contract-docs.js";
export type { ContractDocsProps } from "./contract-docs.js";
