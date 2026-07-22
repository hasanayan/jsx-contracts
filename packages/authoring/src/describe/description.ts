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
 */

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
