/**
 * The ADR 0006 contract description IR and its declarative prose helper — public,
 * semver-stable API re-exported from the package root. `renderCondition` is
 * re-exported from `@jsx-contracts/core` so consumers reach the shared
 * condition-to-English prose through this package too.
 */

export { renderCondition } from "@jsx-contracts/core";
export { describeContract } from "./describe-contract.js";
export type {
  BaseSection,
  ContractDescription,
  DescribedBranch,
  DescribedContract,
  DescribedSlot,
  SlotBounds,
} from "./description.js";
export { toSentences } from "./prose.js";
