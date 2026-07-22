/**
 * The row schema — the compiled shape of an ADR 0003 contract. This file, the
 * JSON schema (`rows-schema.ts`) and the runtime validator (`validate-rows.ts`)
 * move together.
 *
 * The match key is one discriminated field and nothing outside row construction
 * reads its insides — consumers ask for {@link displayName} — so ADR 0004's
 * `identity` variant widens the union here and nowhere else.
 */

export interface NameMatch {
  kind: "name";
  /** The element's full dotted tag, e.g. `"Card.Heading"`. */
  name: string;
}

/** Only {@link NameMatch} today; the union widens with ADR 0004. */
export type MatchKey = NameMatch;

export function displayName(match: MatchKey): string {
  return match.name;
}

/** An omitted end is unconstrained; no `count` at all is 0–∞. */
export interface Count {
  min?: number;
  max?: number;
}

export interface Slot {
  /** Authoring-scoped: sibling references and branch deltas name it, messages never do. */
  alias: string;
  match: MatchKey;
  /** From `is(name, from)` — carried for ADR 0004, not yet matched against. */
  from?: string;
  count?: Count;
  /** Sibling aliases, resolved to display names by the engine. */
  requires?: string[];
  /** Sibling aliases. Symmetry is computed; N-way groups emerge from per-member declarations. */
  excludes?: string[];
}

export type ConditionValue = string | number | boolean;

/** Presence when `values` is absent, one of `values` otherwise. */
export interface WhenProp {
  prop: string;
  values?: ConditionValue[];
}

/**
 * Always objects — no bare-string shorthand — so the engine's canonical
 * normalization (`when-condition-pool`) serves both surfaces (docs/adr/0002-*).
 */
export type When = WhenProp | { all: When[] } | { any: When[] } | { not: When };

/**
 * A delta applied while its condition holds. Branches are independent facts:
 * declaration order never matters, and the engine folds them by one formula
 * (base ∪ active extends − active forbids).
 */
export interface SlotBranch {
  when: When;
  /** The author's intent, appended to a violation this branch drives. */
  because?: string;
  /** An entry re-declaring a base alias replaces its spec; a new alias widens the vocabulary. */
  extend?: Slot[];
  /** Forbid wins over any extend. */
  forbidSlots?: string[];
  /** Raises the base minimum to at least one. */
  requireSlots?: string[];
}

export interface SlotsRow {
  facet: "slots";
  match: MatchKey;
  slots: Slot[];
  /** Whether children outside the vocabulary are violations. `.loose()` opts out. */
  closed: boolean;
  /**
   * When set, an opaque children region that intersects a rule it could break
   * reports "cannot verify" rather than being assumed fine. Orthogonal to
   * {@link closed}.
   */
  strictAnalysis?: boolean;
  because?: string;
  branches?: SlotBranch[];
}

/** Presence is the deprecation; `useInstead` names a replacement when given. */
export interface PropDeprecation {
  useInstead?: string;
}

/**
 * The props map is always loose, so a spec with no constraint is an authoring
 * error and every one of these carries at least one field beyond `prop`.
 */
export interface PropSpec {
  prop: string;
  required?: boolean;
  requires?: string[];
  /** Symmetry is not implied. */
  excludes?: string[];
  deprecated?: PropDeprecation;
}

export interface PropsBranch {
  when: When;
  because?: string;
  props: PropSpec[];
}

export interface PropsRow {
  facet: "props";
  match: MatchKey;
  props: PropSpec[];
  /** At-least-one-of groups: each is satisfied when any one of its props is present. */
  requiresAnyOf?: string[][];
  because?: string;
  branches?: PropsBranch[];
}

/**
 * Dotted shorthand is expanded against the subject at authoring time, so
 * {@link match} is always a whole name.
 */
export interface Forbidden {
  match: MatchKey;
  /** Carried for ADR 0004, not yet matched against. */
  from?: string;
}

/** A slot's triple model minus the sibling relations, which only fit direct children. */
export interface Descendant {
  alias: string;
  match: MatchKey;
  /** Carried for ADR 0004, not yet matched against. */
  from?: string;
  count?: Count;
}

/** Only the bans are branch deltas (ADR 0003 US20); required descendants stay base-level. */
export interface SubtreeBranch {
  when: When;
  because?: string;
  forbidDescendants?: Forbidden[];
  forbidDescendantProps?: string[];
}

export interface SubtreeRow {
  facet: "subtree";
  match: MatchKey;
  /** Required somewhere below, each within its count bounds. */
  descendants: Descendant[];
  forbidDescendants: Forbidden[];
  forbidDescendantProps: string[];
  because?: string;
  branches?: SubtreeBranch[];
}

export interface AncestorRow {
  facet: "ancestor";
  match: MatchKey;
  notInside: Forbidden[];
  deprecated?: PropDeprecation;
  because?: string;
}

export type ContractRow = SlotsRow | PropsRow | SubtreeRow | AncestorRow;

export type ContractRows = ContractRow[];

export type Facet = ContractRow["facet"];
