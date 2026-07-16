import type { ESLint } from "eslint";

import { slots } from "./rules/slots.js";
import { subtree } from "./rules/subtree.js";

export {
  defineContract,
  defineContracts,
  mergeContracts,
} from "./define-contracts.js";
export type { CompiledContracts, Severity } from "./define-contracts.js";
export type {
  ContainerConfig,
  SlotConfig,
  SlotsOptions,
  SlotsMessageId,
} from "./rules/slots.js";
export type {
  ForbiddenElement,
  NoDescendantsConfig,
  SubtreeOptions,
  SubtreeMessageId,
  WhenCondition,
} from "./rules/subtree.js";

/** The plugin's rules, keyed by name: `slots` and `subtree`. */
// @typescript-eslint's rule type and eslint's RuleDefinition are structurally
// close but not assignable; the cast bridges them.
export const rules = {
  slots,
  subtree,
} as unknown as NonNullable<ESLint.Plugin["rules"]>;

/** The `@jsx-contracts` ESLint plugin. Register under that plugin name. */
const plugin: ESLint.Plugin = {
  meta: { name: "@jsx-contracts/eslint-plugin", version: "0.0.0" },
  rules,
};

export default plugin;
