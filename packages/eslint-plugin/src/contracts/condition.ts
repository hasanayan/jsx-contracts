// When-conditions: the half of activation that reads the element's props. The
// other half is the import gate (see import-matcher.ts); a row applies only
// when both hold. Pure — the adapter hands over collected prop facts.

import type { PropFact } from "./model.js";
import type { ConditionValue, WhenCondition } from "./payload.js";

export interface NormalizedWhen {
  prop: string;
  values?: ConditionValue[];
}

// An absent `when` normalizes to `undefined`: the row is always active for the
// matched component. The pool is the only caller — rows reach the engine
// already interned.
function normalizeWhen(
  when: WhenCondition | undefined,
): NormalizedWhen | undefined {
  if (when === undefined) {
    return undefined;
  }

  return typeof when === "string" ? { prop: when } : when;
}

// A resolved literal matches by equality; a member expression or identifier
// matches a string candidate by its dotted source text (e.g. "Size.large").
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

/** Whether a condition holds against an element's props. */
export function conditionHolds(
  when: NormalizedWhen,
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

/**
 * Conditions interned by content: `intern` returns the id the activation mask
 * keys its per-element cache on, so a condition shared by several rows is
 * evaluated once per element however many rows carry it. A when-less row has no
 * id, and is always active for the matched component.
 */
export interface ConditionPool {
  conditions: NormalizedWhen[];
  intern: (when: WhenCondition | undefined) => number | undefined;
}

export function createConditionPool(): ConditionPool {
  const conditions: NormalizedWhen[] = [];
  const ids = new Map<string, number>();

  return {
    conditions,
    intern(when): number | undefined {
      const normalized = normalizeWhen(when);

      if (normalized === undefined) {
        return undefined;
      }

      const key = JSON.stringify([normalized.prop, normalized.values ?? null]);
      const existing = ids.get(key);

      if (existing !== undefined) {
        return existing;
      }

      const id = conditions.length;

      conditions.push(normalized);
      ids.set(key, id);

      return id;
    },
  };
}
