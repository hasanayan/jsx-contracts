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

/** One slot in a slots map: an authoring alias bound to an element identity. */
export interface SlotV2 {
  /**
   * The authoring-scoped alias — the map key, `".Text"` or `"Badge"`. Sibling
   * references and branch deltas name it; messages do not.
   */
  alias: string;
  /** The slot element's identity; its display name is derived from this. */
  match: MatchKey;
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
}

/** One row of the v2 rule table. A discriminated union as facets are added. */
export type ContractRowV2 = SlotsRowV2;

/** The v2 rule table: the payload a v2 rule takes. */
export type ContractRowsV2 = ContractRowV2[];

/** The facets a v2 row can carry. */
export type FacetV2 = ContractRowV2["facet"];
