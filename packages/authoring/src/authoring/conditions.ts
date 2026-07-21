import type { WhenCondition } from "@jsx-contracts/eslint-plugin";

import type { Literal } from "../compile/entry.js";

/**
 * A condition, ready to gate a rule. Opaque apart from the payload tree it
 * carries: `when` is what the compiled row's `when` becomes.
 *
 * @example
 * const compact = prop("variant").is("compact");
 * const roomy = not(compact);
 */
export interface Condition {
  /** The when-condition this compiles to. */
  readonly when: WhenCondition;
}

/** One prop, awaiting the test to make of it. */
export interface PropCondition {
  /**
   * Activate on the prop having one of these values. A string also matches
   * dotted member text, so `is("Size.large")` matches `size={Size.large}`.
   */
  is(...values: [Literal, ...Literal[]]): Condition;
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

function composite(
  operator: "allOf" | "anyOf",
  conditions: Condition[],
): WhenCondition[] {
  const operands = conditions.filter(
    (condition: Condition | undefined) => condition !== undefined,
  );

  if (operands.length < 2) {
    throw new Error(`${operator}: needs at least two conditions.`);
  }

  return operands.map((condition) => condition.when);
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
  return { when: { all: composite("allOf", [first, second, ...rest]) } };
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
  return { when: { any: composite("anyOf", [first, second, ...rest]) } };
}

/**
 * The condition must not hold — how a default-case rule is expressed without
 * enumerating every other value.
 *
 * Negation is the one form that fires on *absent* evidence, so a condition tree
 * containing one is inactive on an element carrying a spread: the spread may
 * carry the very prop being negated. Prefer keeping an unconditional base row
 * and narrowing it over making every row conditional — see the README.
 *
 * @example
 * not(prop("expanded").isPresent())
 */
export function not(condition: Condition): Condition {
  return { when: { not: condition.when } };
}
