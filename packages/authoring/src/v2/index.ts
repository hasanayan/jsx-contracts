/**
 * The ADR 0003 authoring surface. Lives beside the old `contractsFor` builder
 * until ADR 0003 T8 replaces it; imported from `@jsx-contracts/authoring/v2`
 * meanwhile so the old package entry stays untouched.
 */

export { defineContracts, makeRuleSet } from "./define-contracts.js";
export type {
  CollectorContext,
  ContractBuilderV2,
  RuleSetV2,
  Severity,
  SlotSpec,
  SlotSpecBuilder,
  SlotsMap,
  SlotsMapOf,
} from "./define-contracts.js";
export { mergeContracts } from "./merge-contracts.js";
