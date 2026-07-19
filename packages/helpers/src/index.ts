export {
  contract,
  contractsFor,
  defineContracts,
  mergeContracts,
} from "./define-contracts.js";
export type {
  BanBuilder,
  BoundContracts,
  CompiledContracts,
  ContractBuilder,
  PendingBan,
  Severity,
} from "./define-contracts.js";
// The rule table's own types live in @jsx-contracts/eslint-plugin, the package
// that consumes them. Re-exported so `CompiledContracts["rows"]` is nameable
// without a second import.
export type { ContractRow, ContractRows } from "@jsx-contracts/eslint-plugin";
