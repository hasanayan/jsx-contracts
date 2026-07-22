import type {
  Literal,
  NormalizedCondition,
} from "../pinned/condition-semantics.js";
import { matchesWhileAbsent } from "../pinned/condition-semantics.js";

function conditionKey(when: NormalizedCondition): string {
  return JSON.stringify(when);
}

function disjoint(left: Literal[], right: Literal[]): boolean {
  return !left.some((value) => right.includes(value));
}

/**
 * The negation arm: `a` and `not(b)` are exclusive exactly when `a` implies `b`.
 * Incomplete on purpose — an undecided pair reads as "no".
 */
function implies(
  premise: NormalizedCondition,
  conclusion: NormalizedCondition,
): boolean {
  if (conditionKey(premise) === conditionKey(conclusion)) {
    return true;
  }

  if ("all" in conclusion) {
    return conclusion.all.every((operand) => implies(premise, operand));
  }

  if ("any" in premise) {
    return premise.any.every((operand) => implies(operand, conclusion));
  }

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

  // A value test implies the presence test it narrows, unless it matches while absent.
  if (wider === undefined) {
    return premise.values?.some(matchesWhileAbsent) !== true;
  }

  return premise.values?.every((value) => wider.includes(value)) === true;
}

function exclusive(
  left: NormalizedCondition,
  right: NormalizedCondition,
): boolean {
  if ("not" in left) {
    return implies(right, left.not);
  }

  if ("not" in right) {
    return implies(left, right.not);
  }

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

  // Only disjoint value sets on one prop decide anything.
  return (
    left.prop === right.prop &&
    left.values !== undefined &&
    right.values !== undefined &&
    disjoint(left.values, right.values)
  );
}

/** A when-less row is always active, so it is exclusive with nothing. */
export type Exclusivity = (
  left: NormalizedCondition | undefined,
  right: NormalizedCondition | undefined,
) => boolean;

/** Keyed by content, never object identity, so a pair is decided once. */
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
