import type { ConditionValue, When } from "@jsx-contracts/core";

export type Literal = ConditionValue;

/**
 * Mirrors the engine's canonical `normalizeWhen`, because this package carries
 * no runtime dependency on the plugin (ADR 0002) and `findUnsatisfiable` needs
 * canonical conditions. The sibling agreement test ties the two copies together.
 */
export type NormalizedCondition =
  | { prop: string; values?: Literal[] }
  | { all: NormalizedCondition[] }
  | { any: NormalizedCondition[] }
  | { not: NormalizedCondition };

export function normalizeCondition(when: When): NormalizedCondition {
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

// Re-encodes the adapter's canonical absence rule, pinned by the sibling
// agreement test (see docs/adr/0002-*).
export function matchesWhileAbsent(value: Literal): boolean {
  return value === false || value === "undefined";
}
