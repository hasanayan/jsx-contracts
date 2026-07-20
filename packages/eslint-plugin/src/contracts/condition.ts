import { memoized } from "../memo.js";

import type { PropFact, Ref } from "./facts.js";
import type { ConditionValue, WhenCondition } from "./payload.js";

/**
 * A condition tree with the string shorthand expanded, rebuilt with keys in a
 * fixed order so the interning key is canonical.
 */
export type NormalizedWhen =
  | { prop: string; values?: ConditionValue[] }
  | { all: NormalizedWhen[] }
  | { any: NormalizedWhen[] }
  | { not: NormalizedWhen };

// Exported — not through the package's "." barrel, so it stays private to
// consumers — solely for the cross-package agreement test, which reaches it via
// this package's built output to pin the helpers' mirror of this normalization
// against it (see docs/adr/0002-*).
export function normalizeWhen(when: WhenCondition): NormalizedWhen {
  if (typeof when === "string") {
    return { prop: when };
  }

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

// A literal matches by equality; a member expression or identifier by its
// dotted source text (e.g. "Size.large").
function propMatchesValues(prop: PropFact, values: ConditionValue[]): boolean {
  if (prop.value !== undefined && values.includes(prop.value)) {
    return true;
  }

  return (
    prop.source !== undefined &&
    values.some(
      (candidate) => typeof candidate === "string" && candidate === prop.source,
    )
  );
}

function propHolds(
  when: { prop: string; values?: ConditionValue[] },
  props: PropFact[],
): boolean {
  const prop = props.find((fact) => fact.name === when.prop);

  if (prop === undefined) {
    return false;
  }

  return when.values === undefined
    ? prop.present
    : propMatchesValues(prop, when.values);
}

function treeHolds(when: NormalizedWhen, props: PropFact[]): boolean {
  if ("all" in when) {
    return when.all.every((operand) => treeHolds(operand, props));
  }

  if ("any" in when) {
    return when.any.some((operand) => treeHolds(operand, props));
  }

  if ("not" in when) {
    return !treeHolds(when.not, props);
  }

  return propHolds(when, props);
}

function negates(when: NormalizedWhen): boolean {
  if ("not" in when) {
    return true;
  }

  if ("all" in when) {
    return when.all.some(negates);
  }

  if ("any" in when) {
    return when.any.some(negates);
  }

  return false;
}

/** A normalized condition, with the one fact about it worth computing once. */
interface PooledCondition {
  when: NormalizedWhen;
  /**
   * Whether the tree contains a `not`. A negation fires on absent evidence, so
   * a spread — which may carry the very prop being negated — makes the whole
   * tree unreadable rather than merely unsatisfied.
   */
  negates: boolean;
}

/**
 * Whether a condition holds against an element's props.
 *
 * A tree containing a negation is inactive on an element carrying a spread,
 * which can leave a facet unchecked when every row is conditional. Absent a
 * spread, a missing prop satisfies a negated test.
 */
function conditionHolds(
  condition: PooledCondition,
  props: PropFact[],
  hasSpread: boolean,
): boolean {
  if (condition.negates && hasSpread) {
    return false;
  }

  return treeHolds(condition.when, props);
}

/**
 * What a condition is read against: the element's identity, which the pool's
 * cache keys on, and the two prop facts the trees consult.
 */
export interface ConditionSubject {
  elementRef: Ref;
  props: () => PropFact[];
  hasSpread: () => boolean;
}

/**
 * Conditions interned by content, and evaluated only through the pool that
 * interned them: `intern` returns the id the activation mask carries, `holdsAt`
 * is the sole way to spend one. An id means nothing outside its own pool — two
 * rule tables each number theirs from 0 — so the pool owns the per-element cache
 * as well, which is what keeps one table's verdict off another table's element.
 * A condition shared by several rows is evaluated once per element however many
 * rows carry it; a when-less row has no id, and is always active for the matched
 * component.
 */
export interface ConditionPool {
  intern: (when: WhenCondition | undefined) => number | undefined;
  holdsAt: (element: ConditionSubject, conditionId: number) => boolean;
}

export function createConditionPool(): ConditionPool {
  const conditions: PooledCondition[] = [];
  const ids = new Map<string, number>();
  const verdicts = new WeakMap<Ref, Map<number, boolean>>();

  return {
    intern(when): number | undefined {
      if (when === undefined) {
        return undefined;
      }

      const normalized = normalizeWhen(when);
      const key = JSON.stringify(normalized);
      const existing = ids.get(key);

      if (existing !== undefined) {
        return existing;
      }

      const id = conditions.length;

      conditions.push({ when: normalized, negates: negates(normalized) });
      ids.set(key, id);

      return id;
    },
    holdsAt(element, conditionId): boolean {
      // Two levels — element, then condition — so two applications of the
      // one-level memo. `false` caches: it is a verdict, not a miss.
      return memoized(
        memoized(
          verdicts,
          element.elementRef,
          () => new Map<number, boolean>(),
        ),
        conditionId,
        () => {
          const condition = conditions[conditionId];

          // Unreachable: an id only ever comes from this pool's own `intern`.
          // False is the safe direction anyway — an unknown condition leaves
          // its row inactive rather than enforcing an unknown rule.
          return (
            condition !== undefined &&
            conditionHolds(condition, element.props(), element.hasSpread())
          );
        },
      );
    },
  };
}
