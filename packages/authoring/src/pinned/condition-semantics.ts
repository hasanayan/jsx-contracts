import type { WhenCondition } from "@jsx-contracts/eslint-plugin";

import type { Literal } from "../compile/entry.js";

/**
 * A condition tree with the string shorthand expanded and every object's keys
 * written in a fixed order, so two conditions that mean the same thing hash
 * alike. Mirrors the core's own `normalizeWhen`, which is canonical
 * (see docs/adr/0002-*).
 */
export type NormalizedCondition =
  | { prop: string; values?: Literal[] }
  | { all: NormalizedCondition[] }
  | { any: NormalizedCondition[] }
  | { not: NormalizedCondition };

export function normalizeCondition(when: WhenCondition): NormalizedCondition {
  if (typeof when === "string") {
    return { prop: when };
  }

  if ("all" in when) {
    return { all: when.all.map(normalizeCondition) };
  }

  if ("any" in when) {
    return { any: when.any.map(normalizeCondition) };
  }

  if ("not" in when) {
    return { not: normalizeCondition(when.not) };
  }

  return when.values === undefined
    ? { prop: when.prop }
    : { prop: when.prop, values: [...when.values] };
}

// Values a test matches on a prop the model counts as absent: `as={false}` and
// `as={undefined}`. Exported for the sibling agreement test, which pins this
// re-encoding of the adapter's absence rule against the adapter itself — the
// adapter's `isAttributePresent` is canonical (see docs/adr/0002-*).
export function matchesWhileAbsent(value: Literal): boolean {
  return value === false || value === "undefined";
}
