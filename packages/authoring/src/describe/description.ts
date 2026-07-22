/**
 * The contract description IR (ADR 0006) — public, semver-stable data in the
 * authoring package. `describeContract` produces it from compiled rows; renderers
 * (the prose helper here, the Storybook doc block, any third-party tool) consume
 * it and nothing deeper.
 *
 * Identity appears only as precomputed display strings ("Card.Heading.Text"),
 * never a row match key — so ADR 0004's key change is invisible to every
 * consumer. Fields evolve additively: sections a contract does not use are
 * absent, never empty placeholders.
 *
 * Conditions are the one exception to the display-string rule: a branch carries
 * the raw `When` AST (`@jsx-contracts/core`), never a pre-rendered string, so the
 * prose helper and the plugin both phrase it through the same shared renderer.
 * The AST names props, never row match keys, so ADR 0004's identity change stays
 * invisible here too.
 */

import type { When } from "@jsx-contracts/core";

/** The whole rule set as data: one entry per described contract. */
export interface ContractDescription {
  contracts: DescribedContract[];
}

export interface DescribedContract {
  /** Identity-derived display name of the subject, e.g. `"Card.Heading"`. */
  subject: string;
  /**
   * The always-active children facts. Absent when the contract declares no
   * children facet — an inapplicable section is simply missing.
   */
  base?: BaseSection;
  /**
   * One delta per `when` branch, in declaration order. Branches are independent
   * facts, never flattened into effective-vocabulary combinations — a consumer
   * that wants the combined view derives it. Absent when the contract has no
   * branches.
   */
  branches?: DescribedBranch[];
}

/**
 * A single `when` branch as the delta it was authored as: its condition, what it
 * changes while active, and the author's `because`. The effective vocabulary
 * under this condition is a consumer's fold of base and delta, never stored here.
 */
export interface DescribedBranch {
  /**
   * The condition AST, phrased to English by the prose helper (or the plugin)
   * through `@jsx-contracts/core`'s shared renderer — never a stored string.
   */
  when: When;
  /** The author's `because`, verbatim; absent when unauthored. */
  because?: string;
  /** Slots this branch adds or re-specs while active; absent when none. */
  extend?: DescribedSlot[];
  /** Display names of slots this branch forbids while active; absent when none. */
  forbids?: string[];
  /** Display names of slots this branch requires while active; absent when none. */
  requires?: string[];
}

export interface BaseSection {
  /** Whether children outside the declared vocabulary are violations. */
  closed: boolean;
  slots: DescribedSlot[];
}

export interface DescribedSlot {
  /**
   * Identity-derived display name, never an authoring alias, e.g.
   * `"Card.Heading.Text"`.
   */
  name: string;
  /** Absent when the slot is unconstrained (0 to ∞ occurrences). */
  bounds?: SlotBounds;
  /** Display names of siblings this slot requires; absent when none. */
  requires?: string[];
  /**
   * Display names of siblings this slot cannot appear with, symmetry already
   * folded in; absent when none.
   */
  excludes?: string[];
}

/** A slot's occurrence count, phrased as the constraint that was authored. */
export type SlotBounds =
  | { kind: "exactly"; count: number }
  | { kind: "atLeast"; count: number }
  | { kind: "atMost"; count: number }
  | { kind: "between"; min: number; max: number };
