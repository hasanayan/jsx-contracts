/**
 * The ADR 0003 authoring surface — the package's public API, re-exported from
 * the package root (`src/index.ts`). `defineContracts` injects the
 * `contract(name, from)` primitive; conditions and the whole-repo helpers are
 * free imports.
 */

export { allOf, anyOf, not, prop } from "./conditions.js";
export type { Condition, PropCondition } from "./conditions.js";
export { defineContracts } from "./define-contracts.js";
export type {
  BranchDelta,
  BranchDeltaBuilder,
  BranchOptions,
  CollectorContext,
  ContractBuilder,
  DescendantSpec,
  DescendantSpecBuilder,
  DescendantsMap,
  ForbidEntry,
  PropSpec,
  PropSpecBuilder,
  PropsMap,
  RuleSet,
  Severity,
  SlotSpec,
  SlotSpecBuilder,
  SlotsMap,
  SlotsMapOf,
} from "./define-contracts.js";
export { findUnsatisfiable } from "./find-unsatisfiable.js";
export type {
  Conflict,
  ConflictingBranch,
  ConflictKind,
  UnsatisfiableOptions,
} from "./find-unsatisfiable.js";
export { mergeContracts } from "./merge-contracts.js";
