export { contract } from "./contract-builder.js";
export type {
  BanBuilder,
  ContractBuilder,
  PendingBan,
} from "./contract-builder.js";
export { contractsFor, defineContracts } from "./define-contracts.js";
export type { BoundContracts } from "./define-contracts.js";
export { mergeContracts } from "./merge-contracts.js";
export type { CompiledContracts, Severity } from "./rule-table.js";
// The rule table's own types live in @jsx-contracts/eslint-plugin, the package
// that consumes them. Re-exported so `CompiledContracts["rows"]` is nameable
// without a second import.
export type { ContractRow, ContractRows } from "@jsx-contracts/eslint-plugin";
