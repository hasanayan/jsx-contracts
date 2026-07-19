import type { ESLint } from "eslint";

import type {
  AncestorConfig,
  ContainerConfig,
  ForbiddenElement,
  NoDescendantsConfig,
  PropsConfig,
  SlotConfig,
  WhenCondition,
} from "@jsx-contracts/helpers";

import { ancestorGranular } from "./rules/ancestor.js";
import { propsGranular } from "./rules/props.js";
import { slotsGranular } from "./rules/slots.js";
import { subtreeGranular } from "./rules/subtree.js";

// The authoring API (defineContracts, contractsFor, contract, mergeContracts)
// lives in @jsx-contracts/helpers; this plugin only enforces. The payload
// types are re-exported type-only so consumers can still annotate raw payloads
// written by hand — @jsx-contracts/helpers stays the single source of truth.
export type {
  AncestorConfig,
  ContainerConfig,
  ForbiddenElement,
  NoDescendantsConfig,
  PropsConfig,
  SlotConfig,
  WhenCondition,
};
export type { SlotsOptions, SlotsMessageId } from "./rules/slots.js";
export type { SubtreeOptions, SubtreeMessageId } from "./rules/subtree.js";
export type { PropsOptions, PropsMessageId } from "./rules/props.js";
export type { AncestorOptions, AncestorMessageId } from "./rules/ancestor.js";

/**
 * The plugin's thirteen rules — one per facet feature: `slots.children`,
 * `slots.count`, `slots.placement`, `slots.requires`, `slots.exclusive`,
 * `slots.strict`, `subtree.forbid`, `subtree.forbidProps`, `subtree.count`,
 * `props.required`, `props.exclusive`, `props.deprecated`, and
 * `ancestor.forbid`. Each reports just its slice, so a single feature can be
 * switched off or targeted with an eslint-disable comment. Register them with
 * `contracts.rules()`.
 */
// @typescript-eslint's rule type and eslint's RuleDefinition are structurally
// close but not assignable; the cast bridges them.
export const rules = {
  ...slotsGranular,
  ...subtreeGranular,
  ...propsGranular,
  ...ancestorGranular,
} as unknown as NonNullable<ESLint.Plugin["rules"]>;

/** The `@jsx-contracts` ESLint plugin. Register under that plugin name. */
const plugin: ESLint.Plugin = {
  meta: { name: "@jsx-contracts/eslint-plugin", version: "0.0.0" },
  rules,
};

export default plugin;
