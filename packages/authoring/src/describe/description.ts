/**
 * The contract description IR (ADR 0006) — public, semver-stable data in the
 * authoring package. `describeContract` produces it from compiled rows; renderers
 * (the prose helper here, the Storybook doc block, any third-party tool) consume
 * it and nothing deeper.
 *
 * Identity appears only as precomputed display strings ("Card.Heading.Text"),
 * never a row match key — so ADR 0004's key change is invisible to every
 * consumer. Prop and descendant-prop names are plain author strings, never
 * identity. Fields evolve additively: sections a contract does not use are
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
   * The always-active facts across every facet the contract declares. Every
   * described contract has one — a contract that declared nothing would compile
   * to no rows and never reach here.
   */
  base: BaseSection;
  /**
   * One delta per `when` branch. Branches are independent facts, never flattened
   * into effective-vocabulary combinations — a consumer that wants the combined
   * view derives it. A single authored `when` that touches several facets is
   * reunited into one entry here. Absent when the contract has no branches.
   */
  branches?: DescribedBranch[];
}

/**
 * The base facts, one optional sub-section per facet the contract declares. The
 * shape mirrors the contract's structure (ADR 0006): the children table, prop
 * rules, descendants, and the component-level verbs. A facet the contract does
 * not use is simply absent.
 */
export interface BaseSection {
  /**
   * The direct-children facet — vocabulary, closure and analysis strictness.
   * Absent when the contract declares no children facet.
   */
  children?: ChildrenSection;
  /** Prop rules, one entry per constrained prop. Absent when no props facet. */
  props?: DescribedProp[];
  /**
   * At-least-one-of prop groups: each group is satisfied when any one of its
   * prop names is present. Absent when none are declared.
   */
  requiresAnyOf?: string[][];
  /**
   * Components required somewhere in the subtree, each within its bounds. Absent
   * when none are declared.
   */
  descendants?: DescribedDescendant[];
  /** Display names of components forbidden anywhere below; absent when none. */
  forbidsDescendants?: string[];
  /** Prop names forbidden on any descendant; absent when none. */
  forbidsDescendantProps?: string[];
  /** Display names of ancestors this component may not appear inside; absent when none. */
  notInside?: string[];
  /** Set when the component itself is deprecated; absent otherwise. */
  deprecated?: Deprecation;
}

/** The direct-children facet: what may appear as a child and how it is analysed. */
export interface ChildrenSection {
  /** Whether children outside the declared vocabulary are violations. */
  closed: boolean;
  slots: DescribedSlot[];
  /**
   * True when opaque children regions that could break a rule are reported
   * rather than assumed fine (`.strictAnalysis()`). Absent when the default
   * assume-fine behaviour holds.
   */
  strictAnalysis?: boolean;
}

/**
 * A single `when` branch as the delta it was authored as: its condition, what it
 * changes while active across every facet it touches, and the author's `because`.
 * The effective vocabulary under this condition is a consumer's fold of base and
 * delta, never stored here.
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
  /** Prop rules this branch adds while active; absent when none. */
  props?: DescribedProp[];
  /** Display names of components this branch forbids anywhere below; absent when none. */
  forbidsDescendants?: string[];
  /** Prop names this branch forbids on any descendant; absent when none. */
  forbidsDescendantProps?: string[];
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

/**
 * A prop rule. `name` and every reference are author prop names, never identity —
 * props are matched by name, not resolved to a display string. Unlike slots,
 * `excludes` symmetry is not implied, so it is passed through as authored.
 */
export interface DescribedProp {
  /** The prop's name, e.g. `"href"`. */
  name: string;
  /** True when the prop must be present; absent otherwise. */
  required?: boolean;
  /** Names of props this one requires; absent when none. */
  requires?: string[];
  /** Names of props this one cannot appear with; absent when none. */
  excludes?: string[];
  /** Set when the prop is deprecated; absent otherwise. */
  deprecated?: Deprecation;
}

/** A component required somewhere in the subtree, within its occurrence bounds. */
export interface DescribedDescendant {
  /** Identity-derived display name, e.g. `"Tabs.Tab"`. */
  name: string;
  /** Absent when the descendant is unconstrained (0 to ∞ occurrences). */
  bounds?: SlotBounds;
}

/** A deprecation, component- or prop-level. `useInstead` names a replacement when given. */
export interface Deprecation {
  /** The replacement to use instead; absent when none was named. */
  useInstead?: string;
}

/** An occurrence count, phrased as the constraint that was authored. */
export type SlotBounds =
  | { kind: "exactly"; count: number }
  | { kind: "atLeast"; count: number }
  | { kind: "atMost"; count: number }
  | { kind: "between"; min: number; max: number };
