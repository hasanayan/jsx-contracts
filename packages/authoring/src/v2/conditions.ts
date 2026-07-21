/**
 * The v2 condition constructors: `prop().is()/.isPresent()`, `allOf`, `anyOf`,
 * `not`. They build the {@link WhenV2} data AST — no opaque predicates, so the
 * plugin's canonical normalization can intern a condition, message assembly can
 * render it to English, and `findUnsatisfiable` can reason over it.
 *
 * These are the v2 surface's own constructors; the old `authoring/conditions`
 * copy stays until ADR 0003 T8 deletes it.
 */

import type { ConditionValueV2, WhenV2 } from "@jsx-contracts/eslint-plugin";

/**
 * A condition, ready to gate a branch. Opaque apart from the tree it carries:
 * `when` is what a compiled branch's `when` becomes.
 */
export interface Condition {
  /** The condition tree this compiles to. */
  readonly when: WhenV2;
}

/** One prop, awaiting the test to make of it. */
export interface PropCondition {
  /**
   * Activate on the prop holding one of these values. A string also matches
   * dotted member text, so `is("Size.large")` matches `size={Size.large}`.
   */
  is(...values: [ConditionValueV2, ...ConditionValueV2[]]): Condition;
  /** Activate on the prop being present, whatever its value. */
  isPresent(): Condition;
}

/**
 * Name a prop to condition on.
 *
 * @example
 * prop("as").is("a", "button")
 * prop("dense").isPresent()
 */
export function prop(name: string): PropCondition {
  return {
    is(...values): Condition {
      if (values.length === 0) {
        throw new Error(`prop: is() on "${name}" needs at least one value.`);
      }

      return { when: { prop: name, values: [...values] } };
    },
    isPresent(): Condition {
      return { when: { prop: name } };
    },
  };
}

function operands(
  operator: "allOf" | "anyOf",
  conditions: Condition[],
): WhenV2[] {
  // Filter first: an untyped caller can reach this with a single operand, which
  // arrives as a real condition plus an `undefined` second.
  const present = conditions.filter(
    (condition: Condition | undefined) => condition !== undefined,
  );

  if (present.length < 2) {
    throw new Error(`${operator}: needs at least two conditions.`);
  }

  return present.map((condition) => condition.when);
}

/**
 * Every condition must hold. Two operands minimum — one would just be itself —
 * and trees nest freely.
 *
 * @example
 * allOf(prop("variant").is("compact"), prop("dense").isPresent())
 */
export function allOf(
  first: Condition,
  second: Condition,
  ...rest: Condition[]
): Condition {
  return { when: { all: operands("allOf", [first, second, ...rest]) } };
}

/**
 * At least one condition must hold.
 *
 * @example
 * anyOf(prop("as").is("a"), prop("href").isPresent())
 */
export function anyOf(
  first: Condition,
  second: Condition,
  ...rest: Condition[]
): Condition {
  return { when: { any: operands("anyOf", [first, second, ...rest]) } };
}

/**
 * The condition must not hold — how a default-case branch is expressed without
 * enumerating every other value. A negation fires on *absent* evidence, so a
 * tree containing one is inactive on an element carrying a spread.
 *
 * @example
 * not(prop("expanded").isPresent())
 */
export function not(condition: Condition): Condition {
  return { when: { not: condition.when } };
}
