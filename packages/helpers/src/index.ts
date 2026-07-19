// The builder itself is not exported: `contractsFor` binds the gate and the
// module's types, and the `contract` destructured off it is the only way to
// reach one. Its types stay exported so a consumer can name what it hands back.
export type { Condition, PropCondition } from "./condition.js";
export type {
  ContractBuilder,
  ContractMethods,
  Fragment,
  PendingCount,
  SlotBuilder,
} from "./contract-builder.js";
export { contractsFor } from "./contracts-for.js";
export type { BoundContracts } from "./contracts-for.js";
export { mergeContracts } from "./merge-contracts.js";
export type { CompiledContracts, Severity } from "./rule-table.js";
// The rule table's own types live in @jsx-contracts/eslint-plugin, the package
// that consumes them. Re-exported so `CompiledContracts["rows"]` is nameable
// without a second import.
export type { ContractRow, ContractRows } from "@jsx-contracts/eslint-plugin";
