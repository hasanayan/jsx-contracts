/**
 * The one formula every branch composes through: base ∪ active `extend`s −
 * active `forbidSlot`s, with `requireSlot` raising a minimum. Branches are read
 * as a set, so declaration order never changes the result and forbid always
 * wins. Pure over the row and an activeness predicate.
 */

import { renderCondition } from "./condition-prose.js";
import { matchKeyId } from "./match.js";
import type { MatchKey, Slot, SlotBranch, SlotsRow } from "./rows.js";
import { displayName } from "./rows.js";

interface Exclusion {
  because?: string;
  /** Carried so the reader can gate the name it is keyed by. */
  match: MatchKey;
}

interface ForbiddenSlot extends Exclusion {
  witness: string;
}

interface Conditional extends Exclusion {
  condition: string;
}

/**
 * Bucketed by display name for the reader's lookup, but a bucket holds every
 * gate declared under that name — `Button` from two design systems is two
 * entries, and the reader picks by matching the element.
 */
export type GatedByName<T> = Map<string, T[]>;

export interface EffectiveVocabulary {
  container: string;
  closed: boolean;
  because?: string;
  slots: Slot[];
  forbidden: GatedByName<ForbiddenSlot>;
  conditional: GatedByName<Conditional>;
}

function add<T extends { match: MatchKey }>(
  target: GatedByName<T>,
  entry: T,
): void {
  const name = displayName(entry.match);
  const bucket = target.get(name);

  if (bucket === undefined) {
    target.set(name, [entry]);
  } else {
    bucket.push(entry);
  }
}

function holds<T extends { match: MatchKey }>(
  target: GatedByName<T>,
  match: MatchKey,
): boolean {
  const id = matchKeyId(match);

  return (target.get(displayName(match)) ?? []).some(
    (entry) => matchKeyId(entry.match) === id,
  );
}

// Clones, so the base row is untouched.
function raiseMin(slot: Slot): Slot {
  const min = Math.max(slot.count?.min ?? 0, 1);

  return { ...slot, count: { ...slot.count, min } };
}

/** Extends and requires apply first, then forbids remove — so forbid wins. */
export function computeEffectiveVocabulary(
  row: SlotsRow,
  isActive: (branchIndex: number) => boolean,
): EffectiveVocabulary {
  const container = displayName(row.match);
  const branches = row.branches ?? [];

  const byAlias = new Map<string, Slot>(
    row.slots.map((slot) => [slot.alias, slot]),
  );

  const forbidden: GatedByName<ForbiddenSlot> = new Map();
  const conditional: GatedByName<Conditional> = new Map();

  const active: SlotBranch[] = [];
  const inactive: SlotBranch[] = [];

  branches.forEach((branch, index) => {
    (isActive(index) ? active : inactive).push(branch);
  });

  for (const branch of active) {
    for (const slot of branch.extend ?? []) {
      byAlias.set(slot.alias, slot);
    }

    for (const alias of branch.requireSlots ?? []) {
      const slot = byAlias.get(alias);

      if (slot !== undefined) {
        byAlias.set(alias, raiseMin(slot));
      }
    }
  }

  for (const branch of active) {
    for (const alias of branch.forbidSlots ?? []) {
      const slot = byAlias.get(alias);

      if (slot === undefined) {
        continue;
      }

      add(forbidden, {
        match: slot.match,
        witness: renderCondition(branch.when, container),
        because: branch.because,
      });

      byAlias.delete(alias);
    }
  }

  const slots = [...byAlias.values()];
  const allowed = new Set(slots.map((slot) => matchKeyId(slot.match)));

  // Named so a violation can point at the condition that would allow it. Keyed
  // by identity, not name: one gate being allowed says nothing about another's.
  for (const branch of inactive) {
    for (const slot of branch.extend ?? []) {
      if (
        allowed.has(matchKeyId(slot.match)) ||
        holds(conditional, slot.match)
      ) {
        continue;
      }

      add(conditional, {
        match: slot.match,
        condition: renderCondition(branch.when, container),
        because: branch.because,
      });
    }
  }

  return {
    container,
    closed: row.closed,
    because: row.because,
    slots,
    forbidden,
    conditional,
  };
}
