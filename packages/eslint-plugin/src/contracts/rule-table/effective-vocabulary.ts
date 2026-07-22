/**
 * The one formula every branch composes through: base ∪ active `extend`s −
 * active `forbidSlot`s, with `requireSlot` raising a minimum. Branches are read
 * as a set, so declaration order never changes the result and forbid always
 * wins. Pure over the row and an activeness predicate.
 */

import { renderCondition } from "./condition-prose.js";
import type { Slot, SlotBranch, SlotsRow } from "./rows.js";
import { displayName } from "./rows.js";

interface Exclusion {
  because?: string;
}

interface ForbiddenSlot extends Exclusion {
  witness: string;
}

interface Conditional extends Exclusion {
  condition: string;
}

export interface EffectiveVocabulary {
  container: string;
  closed: boolean;
  because?: string;
  slots: Slot[];
  forbidden: Map<string, ForbiddenSlot>;
  conditional: Map<string, Conditional>;
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

  const forbidden = new Map<string, ForbiddenSlot>();
  const conditional = new Map<string, Conditional>();

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

      forbidden.set(displayName(slot.match), {
        witness: renderCondition(branch.when, container),
        because: branch.because,
      });

      byAlias.delete(alias);
    }
  }

  const slots = [...byAlias.values()];
  const allowed = new Set(slots.map((slot) => displayName(slot.match)));

  // Named so a violation can point at the condition that would allow it.
  for (const branch of inactive) {
    for (const slot of branch.extend ?? []) {
      const name = displayName(slot.match);

      if (allowed.has(name) || conditional.has(name)) {
        continue;
      }

      conditional.set(name, {
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
