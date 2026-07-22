import type { ESLint } from "eslint";

import { ancestorRules } from "./adapter/rules/ancestor.js";
import { propsRules } from "./adapter/rules/props.js";
import { slotsRules } from "./adapter/rules/slots.js";
import { subtreeRules } from "./adapter/rules/subtree.js";

// The row schema (ADR 0003). The authoring collector compiles to these; a
// hand-written or generated table can be type-checked against them.
export type {
  AncestorRow,
  ContractRows,
  ContractRow,
  Count,
  Descendant,
  Facet,
  Forbidden,
  ConditionValue,
  MatchKey,
  NameMatch,
  PropDeprecation,
  PropsBranch,
  PropsRow,
  PropSpec,
  SlotBranch,
  SlotsRow,
  Slot,
  SubtreeBranch,
  SubtreeRow,
  WhenProp,
  When,
} from "./contracts/rule-table/rows.js";
export type {
  ClosureMessageId,
  SlotsMessageId,
} from "./adapter/rules/slots.js";
export type { PropsMessageId } from "./adapter/rules/props.js";
export type { SubtreeMessageId } from "./adapter/rules/subtree.js";
export type { AncestorMessageId } from "./adapter/rules/ancestor.js";

/**
 * One rule per facet. Each takes the whole rule table and reports only its own
 * facet, so a single feature can be switched off or eslint-disabled.
 */
export const rules = {
  ...slotsRules,
  ...propsRules,
  ...subtreeRules,
  ...ancestorRules,
} as unknown as NonNullable<ESLint.Plugin["rules"]>;

/**
 * The single owner of the rule-id list: every other spelling derives from or is
 * pinned against it, so a rename here is a type error there, not a dead key.
 */
export type RuleId = keyof typeof rules;

const plugin: ESLint.Plugin = {
  meta: { name: "@jsx-contracts/eslint-plugin", version: "0.0.0" },
  rules,
};

export default plugin;
