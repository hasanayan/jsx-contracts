/**
 * The condition constructors. They build the {@link When} data AST — no opaque
 * predicates, so conditions can be interned, rendered to English, and reasoned
 * over by `findUnsatisfiable`.
 */

import type { ConditionValue, When } from "@jsx-contracts/eslint-plugin";

export interface Condition {
  readonly when: When;
}

export interface PropCondition {
  /** A string also matches dotted member text: `is("Size.large")` matches `size={Size.large}`. */
  is(...values: [ConditionValue, ...ConditionValue[]]): Condition;
  isPresent(): Condition;
}

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
): When[] {
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

/** Two operands minimum — one would just be itself. */
export function allOf(
  first: Condition,
  second: Condition,
  ...rest: Condition[]
): Condition {
  return { when: { all: operands("allOf", [first, second, ...rest]) } };
}

export function anyOf(
  first: Condition,
  second: Condition,
  ...rest: Condition[]
): Condition {
  return { when: { any: operands("anyOf", [first, second, ...rest]) } };
}

/**
 * A negation fires on *absent* evidence, so a tree containing one is inactive on
 * an element carrying a spread.
 */
export function not(condition: Condition): Condition {
  return { when: { not: condition.when } };
}
