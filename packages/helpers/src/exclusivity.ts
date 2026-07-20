// Syntactic mutual exclusivity over condition trees: whether two rows can be
// active on the same element at once. This is what separates a contract that is
// unsatisfiable as written from a combination of rows that can never arise —
// the widening idiom, where mutual exclusivity is the whole design.
//
// Syntactic, not a solver: two `prop(p).is(...)` tests on one prop with
// disjoint value sets are exclusive, `c` and `not(c)` are, and `allOf`/`anyOf`
// distribute over those. Anything it cannot decide is **co-satisfiable**, which
// is the safe direction — the check may miss a conflict, never invent one.

import type { WhenCondition } from "@jsx-contracts/eslint-plugin";

import type { Literal } from "./compile.js";

/**
 * A condition tree with the string shorthand expanded and every object's keys
 * written in a fixed order, so two conditions that mean the same thing hash
 * alike. Mirrors the core's own normalization — the two packages share no
 * runtime code, only the payload shape.
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

/** The interning key of a normalized tree: its content, canonically ordered. */
function conditionKey(when: NormalizedCondition): string {
  return JSON.stringify(when);
}

// A prop fact carries either a resolved literal or the dotted source text of a
// member expression, never both, so one prop matches exactly one token. Two
// value sets sharing no literal therefore cannot both match. `includes` is what
// the evaluator uses, so equality means what it means there.
function disjoint(left: Literal[], right: Literal[]): boolean {
  return !left.some((value) => right.includes(value));
}

// The values a value test matches on a prop the model nonetheless counts as
// absent — `as={false}` and `as={undefined}`, whose facts carry the literal
// `false` and the source text `"undefined"` respectively while `present` is
// false. See `PropFact` in the core's model.
function matchesWhileAbsent(value: Literal): boolean {
  return value === false || value === "undefined";
}

/**
 * Whether `premise` holding forces `conclusion` to hold, syntactically. Used by
 * the negation arm: `a` and `not(b)` are exclusive exactly when `a` implies
 * `b`. Incomplete on purpose — an undecided pair reads as "no".
 */
function implies(
  premise: NormalizedCondition,
  conclusion: NormalizedCondition,
): boolean {
  if (conditionKey(premise) === conditionKey(conclusion)) {
    return true;
  }

  // The two exact steps first — a conjunction is implied exactly when each of
  // its conjuncts is, and a disjunction implies exactly what every disjunct
  // implies. Decomposing the other side is sound but lossy, so it comes after.
  if ("all" in conclusion) {
    return conclusion.all.every((operand) => implies(premise, operand));
  }

  if ("any" in premise) {
    return premise.any.every((operand) => implies(operand, conclusion));
  }

  // A conjunction implies whatever one of its conjuncts implies; a disjunction
  // is implied by whatever implies one of its disjuncts.
  if ("all" in premise) {
    return premise.all.some((operand) => implies(operand, conclusion));
  }

  if ("any" in conclusion) {
    return conclusion.any.some((operand) => implies(premise, operand));
  }

  if ("not" in premise && "not" in conclusion) {
    // Contraposition: ¬a ⇒ ¬b exactly when b ⇒ a.
    return implies(conclusion.not, premise.not);
  }

  if ("not" in premise || "not" in conclusion) {
    return false;
  }

  if (premise.prop !== conclusion.prop) {
    return false;
  }

  const wider = conclusion.values;

  // A value test implies the presence test it narrows — except for the two
  // values a prop can carry while the model still counts it *absent*
  // (`present` is false for a literal `false`, `null` or `undefined`). A value
  // test matches those all the same: `false` as the resolved literal,
  // `"undefined"` as the identifier's source text. A set carrying either
  // implies nothing about presence.
  if (wider === undefined) {
    return premise.values?.some(matchesWhileAbsent) !== true;
  }

  // A narrower value set implies a wider one.
  return premise.values?.every((value) => wider.includes(value)) === true;
}

function exclusive(
  left: NormalizedCondition,
  right: NormalizedCondition,
): boolean {
  // Negation first: `not` needs the *whole* other tree to decide, so
  // decomposing that tree first would throw away the implication.
  if ("not" in left) {
    return implies(right, left.not);
  }

  if ("not" in right) {
    return implies(left, right.not);
  }

  // One contradicted conjunct is enough to contradict a conjunction; a
  // disjunction needs every disjunct contradicted.
  if ("all" in left) {
    return left.all.some((operand) => exclusive(operand, right));
  }

  if ("all" in right) {
    return right.all.some((operand) => exclusive(left, operand));
  }

  if ("any" in left) {
    return left.any.every((operand) => exclusive(operand, right));
  }

  if ("any" in right) {
    return right.any.every((operand) => exclusive(left, operand));
  }

  // Two prop tests. Presence overlaps every value, and two props are
  // independent, so only disjoint value sets on one prop decide anything.
  return (
    left.prop === right.prop &&
    left.values !== undefined &&
    right.values !== undefined &&
    disjoint(left.values, right.values)
  );
}

/**
 * Whether two rows' when-conditions cannot both hold. A when-less row is always
 * active, so it is exclusive with nothing.
 */
export type Exclusivity = (
  left: NormalizedCondition | undefined,
  right: NormalizedCondition | undefined,
) => boolean;

/**
 * The exclusivity test, with its answers memoized. Pairs are keyed by content,
 * never by object identity: one condition hoisted to a constant and shared
 * across components is the same condition as one written out twice, so a pair
 * is decided once however many row pairs carry it.
 */
export function createExclusivity(): Exclusivity {
  const answers = new Map<string, boolean>();

  return (left, right): boolean => {
    if (left === undefined || right === undefined) {
      return false;
    }

    const leftKey = conditionKey(left);
    const rightKey = conditionKey(right);
    // Exclusivity is symmetric, so one order answers both.
    const key =
      leftKey < rightKey ? `${leftKey} ${rightKey}` : `${rightKey} ${leftKey}`;

    const answered = answers.get(key);

    if (answered !== undefined) {
      return answered;
    }

    const answer = exclusive(left, right);

    answers.set(key, answer);

    return answer;
  };
}
