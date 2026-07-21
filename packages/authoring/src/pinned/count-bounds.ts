/** A part's count bounds, both ends resolved. */
export interface CountBounds {
  min: number;
  max: number;
}

/**
 * The bounds a part's declaration asserts — a part asserts only what it writes.
 * A bare declaration is optional and at most one; a lower bound alone is
 * unbounded above; an upper bound alone leaves the part optional.
 *
 * The authoring-side mirror of the core's `resolveBounds`, which is the
 * canonical statement of the rule. Exported for the sibling agreement test,
 * which pins the two copies to agree (see docs/adr/0002-*); not part of this
 * package's supported surface.
 */
export function resolveCountBounds(
  minCount: number | undefined,
  maxCount: number | undefined,
): CountBounds {
  return {
    min: minCount ?? 0,
    max: maxCount ?? (minCount === undefined ? 1 : Infinity),
  };
}
