import type { ESLint } from "eslint";

import { ancestorGranular } from "./rules/ancestor.js";
import { propsGranular } from "./rules/props.js";
import { slotsGranular } from "./rules/slots.js";
import { subtreeGranular } from "./rules/subtree.js";

// The payload types every rule accepts, published so a generated or
// hand-written table can be type-checked against the real thing.
export type {
  AncestorRow,
  ConditionValue,
  ContractRow,
  ContractRows,
  Facet,
  ForbiddenElement,
  PropsRow,
  RequiredDescendant,
  SlotConfig,
  SlotsRow,
  SubtreeRow,
  WhenCondition,
} from "./contracts/payload.js";
export type { SlotsMessageId } from "./rules/slots.js";
export type { SubtreeMessageId } from "./rules/subtree.js";
export type { PropsMessageId } from "./rules/props.js";
export type { AncestorMessageId } from "./rules/ancestor.js";

/**
 * The plugin's thirteen rules — one per facet feature: `slots.children`,
 * `slots.count`, `slots.placement`, `slots.requires`, `slots.exclusive`,
 * `slots.strict`, `subtree.forbid`, `subtree.forbidProps`, `subtree.count`,
 * `props.required`, `props.exclusive`, `props.deprecated`, and
 * `ancestor.forbid`. Each reports just its slice, so a single feature can be
 * switched off or targeted with an eslint-disable comment. Register them with
 * `contracts.rules()`.
 */
const granularRules = {
  ...slotsGranular,
  ...subtreeGranular,
  ...propsGranular,
  ...ancestorGranular,
};

/**
 * The single owner of the facet-feature rule-id list. Every other spelling —
 * the plugin's rules record, and the flat-config keys `@jsx-contracts/helpers`
 * emits — derives from or is pinned against this union, so renaming, adding or
 * removing a rule here is a type error there rather than a silent dead key.
 */
export type RuleId = keyof typeof granularRules;

export const rules = granularRules as unknown as NonNullable<
  ESLint.Plugin["rules"]
>;

/** The `@jsx-contracts` ESLint plugin. Register under that plugin name. */
const plugin: ESLint.Plugin = {
  meta: { name: "@jsx-contracts/eslint-plugin", version: "0.0.0" },
  rules,
};

export default plugin;
