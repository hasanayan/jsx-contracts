import type { ESLint } from "eslint";

import { ancestorGranular } from "./adapter/rules/ancestor.js";
import { propsGranular } from "./adapter/rules/props.js";
import { slotsGranular } from "./adapter/rules/slots.js";
import { subtreeGranular } from "./adapter/rules/subtree.js";
import { slotsV2Rules } from "./adapter/rules-v2/slots.js";

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
} from "./contracts/rule-table/rows.js";
export type { SlotsMessageId } from "./adapter/rules/slots.js";
export type { SubtreeMessageId } from "./adapter/rules/subtree.js";
export type { PropsMessageId } from "./adapter/rules/props.js";
export type { AncestorMessageId } from "./adapter/rules/ancestor.js";

// Row schema v2 (ADR 0003). The authoring collector compiles to these; a
// hand-written or generated v2 table can be type-checked against them.
export type {
  ContractRowsV2,
  ContractRowV2,
  CountV2,
  FacetV2,
  MatchKey,
  NameMatch,
  SlotsRowV2,
  SlotV2,
} from "./contracts/rule-table-v2/rows-v2.js";
export type {
  ClosureMessageId,
  SlotsV2MessageId,
} from "./adapter/rules-v2/slots.js";

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
 * the plugin's rules record, and the flat-config keys `@jsx-contracts/authoring`
 * emits — derives from or is pinned against this union, so renaming, adding or
 * removing a rule here is a type error there rather than a silent dead key.
 */
export type RuleId = keyof typeof granularRules;

// The v2 children rule ships alongside the old surface (deleted in ADR 0003
// T8). It stays out of `granularRules` — and so out of `RuleId` — so the old
// flat-config id list is untouched; it is registered on the plugin all the same.
export const rules = {
  ...granularRules,
  ...slotsV2Rules,
} as unknown as NonNullable<ESLint.Plugin["rules"]>;

/** The `@jsx-contracts` ESLint plugin. Register under that plugin name. */
const plugin: ESLint.Plugin = {
  meta: { name: "@jsx-contracts/eslint-plugin", version: "0.0.0" },
  rules,
};

export default plugin;
