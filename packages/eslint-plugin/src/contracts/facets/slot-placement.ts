/**
 * The slots facet's supplementary index: the placement pass, keyed by slot name
 * rather than by container. The one slots check that fires on the slot element
 * instead of the container, so it sits beside the per-container index in
 * `slots.ts` rather than inside it.
 */

import type { ImportMatcher } from "../activation/import-gate.js";
import { createImportMatcher, matchesGate } from "../activation/import-gate.js";
import type {
  ParentFact,
  Placement,
  Ref,
} from "../rendered-tree/rendered-tree.js";
import type { SlotsRow } from "../rule-table/rows.js";
import { normalizeSlot } from "../rule-table/shorthand.js";
import type { Violation } from "../violation.js";

import type { SlotsMessageId } from "./slots.js";

type SlotsViolation = Violation<SlotsMessageId>;

/** A hoisted placement needs at least one read, every read's parent the container. */
export function isPlacedInContainer(
  placement: Placement,
  container: string,
  matcher: ImportMatcher,
): boolean {
  function isContainer(parent: ParentFact): boolean {
    return (
      parent !== null &&
      parent.name === container &&
      matchesGate(matcher, parent.importSource)
    );
  }

  if (placement.kind === "direct") {
    return isContainer(placement.parent);
  }

  return placement.parents.length > 0 && placement.parents.every(isContainer);
}

// Where a slot may be placed. Checked on the slot itself, so conditional rows
// count too: the container element is not in hand.
interface SlotPlacement {
  container: string;
  containerMatcher: ImportMatcher;
  slotMatcher: ImportMatcher;
}

/** The subset of an element's facts the placement pass reads. */
interface PlacementFacts {
  name: string;
  importSource: string | null;
  placement: () => Placement;
  /** The whole element — where a misplaced slot reports. */
  elementRef: Ref;
}

/** A slot-name-keyed index paired with the check it runs on a matched element. */
interface PlacementIndex {
  names: Set<string>;
  analyze: (element: PlacementFacts) => SlotsViolation[];
}

/**
 * Reports `misplaced` on a declared slot rendered outside its container, one
 * per declaring container.
 */
export function buildPlacementIndex(rows: SlotsRow[]): PlacementIndex {
  const placements = new Map<string, SlotPlacement[]>();

  for (const row of rows) {
    const containerMatcher = createImportMatcher(row.importPath);

    for (const rawSlot of row.slots ?? []) {
      const slot = normalizeSlot(rawSlot);
      const entries = placements.get(slot.name) ?? [];

      entries.push({
        container: row.component,
        containerMatcher,
        slotMatcher:
          slot.importPath === undefined
            ? containerMatcher
            : createImportMatcher(slot.importPath),
      });

      placements.set(slot.name, entries);
    }
  }

  return {
    names: new Set(placements.keys()),
    analyze(element): SlotsViolation[] {
      const declared = placements.get(element.name);

      if (declared === undefined) {
        return [];
      }

      const violations: SlotsViolation[] = [];

      // One `misplaced` per declaring container, deduped.
      const reported = new Set<string>();

      for (const entry of declared) {
        if (
          reported.has(entry.container) ||
          !matchesGate(entry.slotMatcher, element.importSource) ||
          isPlacedInContainer(
            element.placement(),
            entry.container,
            entry.containerMatcher,
          )
        ) {
          continue;
        }

        reported.add(entry.container);
        violations.push({
          ref: element.elementRef,
          messageId: "misplaced",
          data: { container: entry.container, name: element.name },
        });
      }

      return violations;
    },
  };
}
