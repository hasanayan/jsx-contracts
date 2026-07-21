import type { ESLint } from "eslint";

import { ancestorV2Rules } from "./adapter/rules-v2/ancestor.js";
import { propsV2Rules } from "./adapter/rules-v2/props.js";
import { slotsV2Rules } from "./adapter/rules-v2/slots.js";
import { subtreeV2Rules } from "./adapter/rules-v2/subtree.js";

// The runtime condition shape every row's `when`/branch normalizes through,
// published so the authoring package's condition mirror can be pinned against
// it (see docs/adr/0002-*).
export type {
  ConditionValue,
  WhenCondition,
} from "./contracts/activation/when-condition.js";

// Row schema v2 (ADR 0003) — the plugin's only rule-table shape. The authoring
// collector compiles to these; a hand-written or generated table can be
// type-checked against them.
export type {
  AncestorRowV2,
  ContractRowsV2,
  ContractRowV2,
  CountV2,
  DescendantV2,
  FacetV2,
  ForbiddenV2,
  ConditionValueV2,
  MatchKey,
  NameMatch,
  PropDeprecationV2,
  PropsBranchV2,
  PropsRowV2,
  PropSpecV2,
  SlotBranchV2,
  SlotsRowV2,
  SlotV2,
  SubtreeBranchV2,
  SubtreeRowV2,
  WhenPropV2,
  WhenV2,
} from "./contracts/rule-table-v2/rows-v2.js";
export type {
  ClosureMessageId,
  SlotsV2MessageId,
} from "./adapter/rules-v2/slots.js";
export type { PropsV2MessageId } from "./adapter/rules-v2/props.js";
export type { SubtreeV2MessageId } from "./adapter/rules-v2/subtree.js";
export type { AncestorV2MessageId } from "./adapter/rules-v2/ancestor.js";

/**
 * The plugin's four rules — one per facet: `slots.closure`, `props.contract`,
 * `subtree.contract`, and `ancestor.contract`. Each takes the whole v2 rule
 * table as its option and reports only its own facet, so a single feature can
 * be switched off or targeted with an eslint-disable comment. Register them
 * with `defineContracts(...).rules()`.
 */
export const rules = {
  ...slotsV2Rules,
  ...propsV2Rules,
  ...subtreeV2Rules,
  ...ancestorV2Rules,
} as unknown as NonNullable<ESLint.Plugin["rules"]>;

/**
 * The single owner of the facet rule-id list. Every other spelling — the
 * plugin's rules record and the flat-config keys `@jsx-contracts/authoring`
 * emits — derives from or is pinned against this union, so renaming, adding or
 * removing a rule here is a type error there rather than a silent dead key.
 */
export type RuleId = keyof typeof rules;

/** The `@jsx-contracts` ESLint plugin. Register under that plugin name. */
const plugin: ESLint.Plugin = {
  meta: { name: "@jsx-contracts/eslint-plugin", version: "0.0.0" },
  rules,
};

export default plugin;
