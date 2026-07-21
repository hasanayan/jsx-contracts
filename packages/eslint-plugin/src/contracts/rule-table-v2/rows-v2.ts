/**
 * Row schema v2 — the compiled shape of an ADR 0003 contract. One source of
 * truth: this file, the JSON schema (`rows-v2-schema.ts`) and the runtime
 * validator (`validate-rows-v2.ts`) move together.
 *
 * Two commitments the ADR pins here, cheap now and expensive later:
 *
 * - **The match key is one discriminated field.** The `name` variant is all
 *   that ships now; the `identity` variant is reserved (ADR 0004). Nothing
 *   outside row construction reads the key's insides — consumers ask for the
 *   {@link displayName}, never the variant — so widening the union later
 *   touches only this file and its two companions.
 * - **Display names derive from identity.** A violation names the element the
 *   consumer wrote, computed from the match key, never from the authoring
 *   alias.
 */

/**
 * How a row (or a slot within it) is matched against a JSX element. A
 * discriminated union: the `name` variant matches a dotted tag by text, the
 * `identity` variant — matching by resolved symbol — is reserved for ADR 0004
 * and not yet emitted.
 */
export interface NameMatch {
  kind: "name";
  /** The element's full dotted tag, e.g. `"Card.Heading"`. */
  name: string;
}

/** The match key. Only {@link NameMatch} today; the union widens with ADR 0004. */
export type MatchKey = NameMatch;

/** The human-facing display name of a matched element, derived from its identity. */
export function displayName(match: MatchKey): string {
  return match.name;
}

/**
 * A slot's count bounds, as written. An omitted end is unconstrained; a slot
 * with no `count` at all is 0–∞. `exactly(n)` sets both ends to `n`.
 */
export interface CountV2 {
  min?: number;
  max?: number;
}

/** One slot in a slots map: an authoring alias bound to an element identity. */
export interface SlotV2 {
  /**
   * The authoring-scoped alias — the map key, `".Text"` or `"Badge"`. Sibling
   * references and branch deltas name it; messages do not.
   */
  alias: string;
  /** The slot element's identity; its display name is derived from this. */
  match: MatchKey;
  /**
   * The slot's own import gate, from `is(name, from)` — reserved for identity
   * matching (ADR 0004). Carried on the row today but not yet matched against.
   */
  from?: string;
  /** Count bounds this slot writes. Absent leaves the slot unconstrained (0–∞). */
  count?: CountV2;
  /**
   * Sibling aliases this slot requires alongside it. Named by alias — the
   * engine resolves them to display names against this row's own slots.
   */
  requires?: string[];
  /**
   * Sibling aliases this slot excludes. Symmetry is computed and N-way groups
   * emerge from per-member declarations; named by alias like {@link requires}.
   */
  excludes?: string[];
}

/** One literal a v2 prop test matches against. */
export type ConditionValueV2 = string | number | boolean;

/** A prop test: presence when `values` is absent, one of `values` otherwise. */
export interface WhenPropV2 {
  prop: string;
  values?: ConditionValueV2[];
}

/**
 * A condition gating a branch: a prop test, or `all`/`any`/`not` over those,
 * nested freely. The v2 authoring surface builds these from
 * `prop().is()/.isPresent()`, `allOf`, `anyOf`, `not`. There is no bare-string
 * shorthand — v2 conditions are always objects — but the tree is otherwise a
 * subset of the engine WhenCondition, so the engine's canonical condition
 * normalization (`when-condition-pool`) reads it and one implementation serves
 * both surfaces (see docs/adr/0002-*).
 */
export type WhenV2 =
  WhenPropV2 | { all: WhenV2[] } | { any: WhenV2[] } | { not: WhenV2 };

/**
 * One conditional branch over a container's children: a delta applied only
 * while its condition holds on the matched element. Branches are independent
 * facts — declaration order never matters, and the engine folds them into the
 * effective vocabulary by one formula (base ∪ active extends − active forbids).
 */
export interface SlotBranchV2 {
  /** The condition that activates this branch, read against the element's props. */
  when: WhenV2;
  /** The author's intent for this branch, appended to a violation it drives. */
  because?: string;
  /**
   * Slots this branch adds or re-declares while active. An entry re-declaring a
   * base alias replaces its spec; a new alias widens the vocabulary.
   */
  extend?: SlotV2[];
  /** Base aliases this branch forbids while active. Forbid wins over any extend. */
  forbidSlots?: string[];
  /** Base aliases whose minimum this branch raises to at least one while active. */
  requireSlots?: string[];
}

/** One statement about a container's direct children, v2. */
export interface SlotsRowV2 {
  facet: "slots";
  /** The container's identity. */
  match: MatchKey;
  /** The accepted slots, each an alias bound to an identity. */
  slots: SlotV2[];
  /**
   * Whether children outside the declared vocabulary are violations. Closed by
   * default; `.loose()` opts out.
   */
  closed: boolean;
  /** The author's static intent, appended to a violation message. */
  because?: string;
  /** Conditional branches over the children facet; empty or absent for none. */
  branches?: SlotBranchV2[];
}

/**
 * A prop's deprecation, from `deprecated(useInstead?)`. Its presence is the
 * deprecation; `useInstead` names the replacement to hint at, when given.
 */
export interface PropDeprecationV2 {
  useInstead?: string;
}

/**
 * One entry of a props map: a prop name bound to its constraints. The map is
 * always loose — an entry with no constraint at all is an authoring error, so a
 * spec always carries at least one of these fields.
 */
export interface PropSpecV2 {
  /** The prop this entry constrains, i.e. the map key. */
  prop: string;
  /** The prop must be written on the element. */
  required?: boolean;
  /** Props that must be written alongside this one when it is present. */
  requires?: string[];
  /** Props that may not be written alongside this one; symmetry is not implied. */
  excludes?: string[];
  /** This prop is deprecated; present means deprecated, whatever the hint. */
  deprecated?: PropDeprecationV2;
}

/**
 * One conditional branch over a container's props: a props delta applied only
 * while its condition holds. Like {@link SlotBranchV2}, branches are independent
 * facts; each spec it carries is evaluated with the branch's witness and
 * `because` attached to any violation it drives.
 */
export interface PropsBranchV2 {
  /** The condition that activates this branch, read against the element's props. */
  when: WhenV2;
  /** The author's intent for this branch, appended to a violation it drives. */
  because?: string;
  /** Prop specs this branch adds while active, each carrying the branch witness. */
  props: PropSpecV2[];
}

/** One statement about a component's props, v2. */
export interface PropsRowV2 {
  facet: "props";
  /** The component's identity. */
  match: MatchKey;
  /** The prop specs, each a prop name bound to its constraints. */
  props: PropSpecV2[];
  /**
   * Contract-level at-least-one-of groups: each group is satisfied when any one
   * of its props is present. The one `requiresAnyOf` verb compiles here.
   */
  requiresAnyOf?: string[][];
  /** The author's static intent, appended to a violation message. */
  because?: string;
  /** Conditional branches over the props facet; empty or absent for none. */
  branches?: PropsBranchV2[];
}

/** One row of the v2 rule table. A discriminated union as facets are added. */
export type ContractRowV2 = SlotsRowV2 | PropsRowV2;

/** The v2 rule table: the payload a v2 rule takes. */
export type ContractRowsV2 = ContractRowV2[];

/** The facets a v2 row can carry. */
export type FacetV2 = ContractRowV2["facet"];
