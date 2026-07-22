import { memoized } from "../../memoized.js";
import type { PropFact, Ref } from "../rendered-tree/rendered-tree.js";
import type { ConditionValue, When } from "../rule-table/rows.js";

/** Keys in a fixed order, so two conditions that mean the same thing hash alike. */
export type NormalizedWhen =
  | { prop: string; values?: ConditionValue[] }
  | { all: NormalizedWhen[] }
  | { any: NormalizedWhen[] }
  | { not: NormalizedWhen };

// Exported for the cross-package pin only, and not through the "." barrel, so
// it stays private to consumers (see docs/adr/0002-*).
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

// A member expression or identifier matches by its dotted source text.
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

interface PooledCondition {
  when: NormalizedWhen;
  /** A spread may carry the very prop a `not` negates, making the tree unreadable. */
  negates: boolean;
}

/**
 * A tree containing a negation is inactive under a spread, which can leave a
 * facet unchecked when every row is conditional.
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

/** `elementRef` is what the pool's cache keys on. */
export interface ConditionSubject {
  elementRef: Ref;
  props: () => PropFact[];
  hasSpread: () => boolean;
}

/**
 * Conditions interned by content and evaluated only through the pool that
 * interned them. An id means nothing outside its own pool — two rule tables each
 * number theirs from 0 — so the pool owns the per-element cache too, which is
 * what keeps one table's verdict off another table's element. A when-less row
 * has no id and is always active.
 */
export interface ConditionPool {
  intern: (when: When | undefined) => number | undefined;
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
      // Two applications of the one-level memo. `false` caches: it is a
      // verdict, not a miss.
      return memoized(
        memoized(
          verdicts,
          element.elementRef,
          () => new Map<number, boolean>(),
        ),
        conditionId,
        () => {
          const condition = conditions[conditionId];

          // Unreachable, and false is the safe direction anyway: an unknown
          // condition leaves its row inactive.
          return (
            condition !== undefined &&
            conditionHolds(condition, element.props(), element.hasSpread())
          );
        },
      );
    },
  };
}
