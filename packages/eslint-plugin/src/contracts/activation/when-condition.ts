/** A literal a when-condition can match a prop's value against. */
export type ConditionValue = string | number | boolean;

/**
 * A prop test: presence when `values` is absent, one of `values` otherwise. A
 * string value also matches dotted member text like `Size.large`.
 */
interface WhenProp {
  prop: string;
  values?: ConditionValue[];
}

/** Every operand must hold. */
interface WhenAll {
  all: WhenCondition[];
}

/** At least one operand must hold. */
interface WhenAny {
  any: WhenCondition[];
}

/** The operand must not hold. */
interface WhenNot {
  not: WhenCondition;
}

/**
 * Activates a row, read against the props of the element the row names: a prop
 * test — a bare string is shorthand for `{ prop }` — or `all`/`any`/`not` over
 * those, nested freely.
 *
 * Negation fires on *absent* evidence rather than visible evidence, so a tree
 * containing a `not` is inactive on an element carrying a spread: the spread
 * may carry the very prop being negated. Absent a spread, a missing prop
 * satisfies a negated test.
 */
export type WhenCondition = string | WhenProp | WhenAll | WhenAny | WhenNot;
