/**
 * Canonical form for a condition tree: keys in a fixed order, so two conditions
 * that mean the same thing hash alike under `JSON.stringify`. Pure over the
 * `When` AST it normalizes. Interning by content and per-element caching are the
 * plugin's engine concern and stay there; this is the shape they intern.
 */

import type { ConditionValue, When } from "./rows.js";

export type NormalizedWhen =
  | { prop: string; values?: ConditionValue[] }
  | { all: NormalizedWhen[] }
  | { any: NormalizedWhen[] }
  | { not: NormalizedWhen };

export function normalizeWhen(when: When): NormalizedWhen {
  if ("all" in when) {
    return { all: when.all.map(normalizeWhen) };
  }

  if ("any" in when) {
    return { any: when.any.map(normalizeWhen) };
  }

  if ("not" in when) {
    return { not: normalizeWhen(when.not) };
  }

  return when.values === undefined
    ? { prop: when.prop }
    : { prop: when.prop, values: [...when.values] };
}
