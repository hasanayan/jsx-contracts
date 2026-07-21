/**
 * The effective vocabulary of a container's children facet, per element: the
 * one formula every branch composes through — base map ∪ active `extend`s −
 * active `forbidSlot`s, with `requireSlot` raising a minimum. Branches are
 * independent facts, so this reads them as a set: declaration order never
 * changes the result, and a forbidden slot is out no matter which branch
 * re-declares it (forbid wins).
 *
 * Pure over the row and an activeness predicate. Which branches are active is
 * the rule's call — it evaluates each condition against the element's props
 * through the canonical condition pool — so this module stays free of any
 * element or prop fact.
 */

import { renderCondition } from "./condition-prose.js";
import type { SlotBranchV2, SlotV2, SlotsRowV2 } from "./rows-v2.js";
import { displayName } from "./rows-v2.js";

/** Why a display name sits outside the effective vocabulary. */
interface Exclusion {
  /** The condition prose — the branch's witness or the condition it names. */
  because?: string;
}

/** A slot removed by an active forbid: the witness for why it is now barred. */
interface Forbidden extends Exclusion {
  witness: string;
}

/** A slot only an inactive branch would allow: the condition that would allow it. */
interface Conditional extends Exclusion {
  condition: string;
}

/** The children facet's vocabulary for one element, branches folded in. */
export interface EffectiveVocabulary {
  container: string;
  closed: boolean;
  because?: string;
  /** The effective slots: base, with active extends/requires applied and forbids removed. */
  slots: SlotV2[];
  /** Display name → why an active branch forbade it. */
  forbidden: Map<string, Forbidden>;
  /** Display name → the condition an inactive branch would allow it under. */
  conditional: Map<string, Conditional>;
}

/** Raise a slot's minimum to at least one, cloning so the base row is untouched. */
function raiseMin(slot: SlotV2): SlotV2 {
  const min = Math.max(slot.count?.min ?? 0, 1);

  return { ...slot, count: { ...slot.count, min } };
}

/**
 * Fold a container's branches into the vocabulary its children are checked
 * against. `isActive` decides each branch by index. Active extends and requires
 * apply first, then active forbids remove — so forbid wins and order is
 * irrelevant.
 */
export function computeEffectiveVocabulary(
  row: SlotsRowV2,
  isActive: (branchIndex: number) => boolean,
): EffectiveVocabulary {
  const container = displayName(row.match);
  const branches = row.branches ?? [];

  const byAlias = new Map<string, SlotV2>(
    row.slots.map((slot) => [slot.alias, slot]),
  );

  const forbidden = new Map<string, Forbidden>();
  const conditional = new Map<string, Conditional>();

  const active: SlotBranchV2[] = [];
  const inactive: SlotBranchV2[] = [];

  branches.forEach((branch, index) => {
    (isActive(index) ? active : inactive).push(branch);
  });

  // Widen and raise first; a forbid below removes whatever this leaves.
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

  // Forbid wins: capture the name being barred, then drop it.
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

  // A slot no active branch admits, but some inactive branch's extend would:
  // name the condition so a violation can point at it.
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
