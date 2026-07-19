// Pure evaluation of a container's children facet. Check order is significant:
// it fixes which violation is reported first.
//
// A row is prepared once, at intern time; the active rows for one element are
// combined into one effective config and evaluated once, so a violation is
// reported once and its message describes what the combined state allows.

import { formatList } from "./format.js";
import type { ImportMatcher } from "./import-matcher.js";
import { createImportMatcher, matchesGate } from "./import-matcher.js";
import type {
  Branch,
  Branched,
  Ref,
  RenderedNode,
  Violation,
} from "./model.js";
import { canCoexist } from "./model.js";
import type { SlotsRow } from "./payload.js";
import { normalizeSlot } from "./validate.js";

/** Message ids reported by `@jsx-contracts/slots`. */
export type SlotsMessageId =
  | "misplaced"
  | "tooMany"
  | "tooFew"
  | "invalidChild"
  | "requiresSlot"
  | "exclusiveSlots"
  | "unresolvableChild";

type SlotsViolation = Violation<SlotsMessageId>;

export interface PreparedSlot {
  name: string;
  minCount: number;
  maxCount: number;
  matcher: ImportMatcher;
}

/** One slots row, prepared. Combined with the other active rows before use. */
export interface PreparedSlotsRow {
  slots: Map<string, PreparedSlot>;
  requires: Record<string, string> | undefined;
  exclusive: [string[], string[]][] | undefined;
  strict: boolean | undefined;
}

/** The effective children contract for one element: the combination of its active rows. */
export interface CombinedSlots {
  container: string;
  slots: Map<string, PreparedSlot>;
  slotList: string;
  // A slot may require more than one other slot once rows accumulate, so the
  // combined form is a list where a single row's payload holds one name.
  requires: Map<string, string[]>;
  exclusive: [string[], string[]][];
  strict: boolean;
}

// Count-bound defaults: neither bound means at most one; only minCount lifts
// the upper bound; only maxCount keeps a lower bound of zero.
export function prepareSlotsRow(row: SlotsRow): PreparedSlotsRow {
  const containerMatcher = createImportMatcher(row.importPath);
  const slots = new Map<string, PreparedSlot>();

  for (const rawSlot of row.slots) {
    const slot = normalizeSlot(rawSlot);
    const maxCount =
      slot.maxCount ?? (slot.minCount !== undefined ? Infinity : 1);

    slots.set(slot.name, {
      name: slot.name,
      minCount: slot.minCount ?? 0,
      maxCount,
      matcher:
        slot.importPath !== undefined
          ? createImportMatcher(slot.importPath)
          : containerMatcher,
    });
  }

  return {
    slots,
    requires: row.requires,
    exclusive: row.exclusive,
    strict: row.strict,
  };
}

// Two rows both declaring a slot narrow it: the slot must satisfy both gates.
function bothGates(a: ImportMatcher, b: ImportMatcher): ImportMatcher {
  return (specifier): boolean => a(specifier) && b(specifier);
}

/**
 * Combine the rows active on one element into one effective contract.
 *
 * Allowed slots are the **intersection** across rows — a conditional row that
 * lists fewer slots narrows what the container accepts. Bounds are the tightest
 * among the rows that still allow the slot; everything else unions. The result
 * is always satisfiable: a slot required by one row but intersected away by
 * another is simply neither allowed nor required, and a cross-slot reference to
 * a slot that did not survive is dropped rather than left unmeetable.
 */
export function combineSlots(
  container: string,
  rows: PreparedSlotsRow[],
): CombinedSlots {
  const [first, ...rest] = rows;
  const slots = new Map<string, PreparedSlot>();

  for (const [name, slot] of first?.slots ?? []) {
    let combined = slot;
    let dropped = false;

    for (const row of rest) {
      const other = row.slots.get(name);

      if (other === undefined) {
        dropped = true;
        break;
      }

      combined = {
        name,
        minCount: Math.max(combined.minCount, other.minCount),
        maxCount: Math.min(combined.maxCount, other.maxCount),
        matcher: bothGates(combined.matcher, other.matcher),
      };
    }

    if (!dropped) {
      // Tightening from both ends can cross the bounds over; clamping the
      // lower one keeps the combination total rather than unsatisfiable.
      slots.set(name, {
        ...combined,
        minCount: Math.min(combined.minCount, combined.maxCount),
      });
    }
  }

  const requires = new Map<string, string[]>();

  for (const row of rows) {
    for (const [from, to] of Object.entries(row.requires ?? {})) {
      // A reference whose target the intersection removed would be
      // unsatisfiable; drop it instead.
      if (!slots.has(from) || !slots.has(to)) {
        continue;
      }

      const targets = requires.get(from) ?? [];

      if (!targets.includes(to)) {
        targets.push(to);
        requires.set(from, targets);
      }
    }
  }

  const exclusive: [string[], string[]][] = [];
  const seenExclusive = new Set<string>();

  for (const row of rows) {
    for (const pair of row.exclusive ?? []) {
      const key = JSON.stringify(pair);

      if (!seenExclusive.has(key)) {
        seenExclusive.add(key);
        exclusive.push(pair);
      }
    }
  }

  return {
    container,
    slots,
    slotList: formatList([...slots.keys()].map((name) => `<${name}>`)),
    requires,
    exclusive,
    strict: rows.some((row) => row.strict === true),
  };
}

export type ParentFact = { name: string; importSource: string | null } | null;

export type Placement =
  | { kind: "direct"; parent: ParentFact }
  | { kind: "hoisted"; parents: ParentFact[] };

function countWord(count: number): string {
  return count === 1 ? "one" : String(count);
}

// Exponential, but occurrence counts are tiny. Shared with the subtree facet's
// descendant-count check.
export function subsetsOfSize<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  function choose(start: number, chosen: T[]): void {
    if (chosen.length === size) {
      result.push(chosen);

      return;
    }

    for (let index = start; index < items.length; index++) {
      choose(index + 1, [...chosen, items[index] as T]);
    }
  }

  choose(0, []);

  return result;
}

export function allPairwiseCoexist(elements: Branched[]): boolean {
  return elements.every((element, index) =>
    elements.slice(index + 1).every((other) => canCoexist(element, other)),
  );
}

function conditionalIdOf(branch: Branch): string {
  return branch.slice(0, branch.indexOf(":"));
}

function sideOf(branch: Branch): "consequent" | "alternate" {
  return branch.endsWith("consequent") ? "consequent" : "alternate";
}

// The count guaranteed on every render path: each referenced conditional is a
// binary branch point, so enumerate every assignment and take the smallest
// surviving count.
export function minimumGuaranteedCount(occurrences: Branched[]): number {
  const branchPoints = [
    ...new Set(
      occurrences.flatMap((occurrence) =>
        occurrence.branches.map((branch) => conditionalIdOf(branch)),
      ),
    ),
  ];

  let minimum = Infinity;

  for (
    let assignment = 0;
    assignment < 1 << branchPoints.length;
    assignment++
  ) {
    const chosenSide = new Map<string, "consequent" | "alternate">(
      branchPoints.map((point, index) => [
        point,
        (assignment & (1 << index)) === 0 ? "consequent" : "alternate",
      ]),
    );

    const present = occurrences.filter((occurrence) =>
      occurrence.branches.every(
        (branch) => chosenSide.get(conditionalIdOf(branch)) === sideOf(branch),
      ),
    );

    minimum = Math.min(minimum, present.length);
  }

  return minimum === Infinity ? 0 : minimum;
}

// A hoisted placement needs at least one read, and every read's parent must be
// the container.
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

// `containerRef` is the node a tooFew violation reports on.
export function evaluateSlots(
  prepared: CombinedSlots,
  root: RenderedNode,
  containerRef: Ref,
): SlotsViolation[] {
  const { container, slots, slotList } = prepared;
  const violations: SlotsViolation[] = [];

  const hasUnknownContent = root.unknownRefs.length > 0;

  const found: { name: string; maxCount: number; element: RenderedNode }[] = [];

  for (const child of root.children) {
    // A name match is only a slot if the tag also passes the slot's gate;
    // otherwise it is foreign and reported like any invalid child.
    const slot = slots.get(child.name);

    if (slot === undefined || !matchesGate(slot.matcher, child.importSource)) {
      violations.push({
        ref: child.ref,
        messageId: "invalidChild",
        data: { container, slots: slotList },
      });

      continue;
    }

    found.push({
      name: child.name,
      maxCount: slot.maxCount,
      element: child,
    });
  }

  for (const textRef of root.textRefs) {
    violations.push({
      ref: textRef,
      messageId: "invalidChild",
      data: { container, slots: slotList },
    });
  }

  // Exceeds maxCount N when N earlier same-name occurrences can all render
  // alongside it and one another (opposite ternary branches never do).
  for (const [index, slot] of found.entries()) {
    const bound = slot.maxCount;

    if (bound === Infinity) {
      continue;
    }

    const earlierSameName = found
      .slice(0, index)
      .filter((other) => other.name === slot.name)
      .map((other) => other.element);

    const exceeds = subsetsOfSize(earlierSameName, bound).some((subset) =>
      allPairwiseCoexist([...subset, slot.element]),
    );

    if (exceeds) {
      violations.push({
        ref: slot.element.ref,
        messageId: "tooMany",
        data: { container, name: slot.name, maxCount: countWord(bound) },
      });
    }
  }

  // Both slots are statically present, so exclusivity holds regardless of any
  // unresolvable content elsewhere.
  for (const [groupA, groupB] of prepared.exclusive) {
    const groupBNames = new Set(groupB);
    const others = formatList(groupB.map((name) => `<${name}>`));

    for (const slot of found) {
      if (!groupA.includes(slot.name)) {
        continue;
      }

      const conflicts = found.some(
        (other) =>
          groupBNames.has(other.name) &&
          canCoexist(other.element, slot.element),
      );

      if (conflicts) {
        violations.push({
          ref: slot.element.ref,
          messageId: "exclusiveSlots",
          data: { container, name: slot.name, others },
        });
      }
    }
  }

  if (prepared.strict) {
    for (const unknownRef of root.unknownRefs) {
      violations.push({
        ref: unknownRef,
        messageId: "unresolvableChild",
        data: { container },
      });
    }
  } else if (hasUnknownContent) {
    // Unknown content leaves presence checks unprovable, so skip them.
    return violations;
  }

  // One violation per unmet requirement: accumulation can leave a slot
  // requiring more than one other.
  for (const slot of found) {
    for (const required of prepared.requires.get(slot.name) ?? []) {
      const satisfied = found.some(
        (other) =>
          other.name === required && canCoexist(other.element, slot.element),
      );

      if (!satisfied) {
        violations.push({
          ref: slot.element.ref,
          messageId: "requiresSlot",
          data: { container, name: slot.name, required },
        });
      }
    }
  }

  // minCount is a presence claim on every render path, so like requires it
  // shares the unknown-content gate above.
  for (const preparedSlot of slots.values()) {
    if (preparedSlot.minCount === 0) {
      continue;
    }

    const occurrences = found
      .filter((slot) => slot.name === preparedSlot.name)
      .map((slot) => slot.element);

    if (minimumGuaranteedCount(occurrences) < preparedSlot.minCount) {
      violations.push({
        ref: containerRef,
        messageId: "tooFew",
        data: {
          container,
          name: preparedSlot.name,
          minCount: countWord(preparedSlot.minCount),
        },
      });
    }
  }

  return violations;
}
