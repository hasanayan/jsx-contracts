/**
 * The ADR 0006 contract description IR and its declarative prose helper — public,
 * semver-stable API re-exported from the package root.
 */

export { describeContract } from "./describe-contract.js";
export type {
  BaseSection,
  ContractDescription,
  DescribedContract,
  DescribedSlot,
  SlotBounds,
} from "./description.js";
export { toSentences } from "./prose.js";
