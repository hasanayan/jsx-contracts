import type { ImportMatcher } from "../activation/import-gate.js";
import { createImportMatcher, matchesGate } from "../activation/import-gate.js";
import { countWord, formatList } from "../message-text.js";
import { canCoexist } from "../rendered-tree/coexistence.js";
import type { CountVerdict } from "../rendered-tree/count-bounds.js";
import {
  checkCountBounds,
  resolveBounds,
} from "../rendered-tree/count-bounds.js";
import type { Ref, RenderedNode } from "../rendered-tree/rendered-tree.js";
import type { SlotsRow } from "../rule-table/rows.js";
import { normalizeSlot } from "../rule-table/shorthand.js";
import type { Violation } from "../violation.js";

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
  /** `undefined` when the row declares no slots: it sits out the intersection. */
  slots: Map<string, PreparedSlot> | undefined;
  requires: Record<string, string> | undefined;
  exclusive: [string[], string[]][] | undefined;
  strict: boolean | undefined;
}

/** The effective children contract for one element: the combination of its active rows. */
export interface CombinedSlots {
  container: string;
  /** `undefined` when no active row declared a slot list — not the same as an empty one. */
  slots: Map<string, PreparedSlot> | undefined;
  slotList: string;
  /** Slot → the slots it requires; accumulation can leave more than one. */
  requires: Map<string, string[]>;
  exclusive: [string[], string[]][];
  strict: boolean;
}

export function prepareSlotsRow(row: SlotsRow): PreparedSlotsRow {
  const containerMatcher = createImportMatcher(row.importPath);
  const slots =
    row.slots === undefined ? undefined : new Map<string, PreparedSlot>();

  for (const rawSlot of row.slots ?? []) {
    const slot = normalizeSlot(rawSlot);

    slots?.set(slot.name, {
      name: slot.name,
      ...resolveBounds(slot.minCount, slot.maxCount),
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

function bothGates(a: ImportMatcher, b: ImportMatcher): ImportMatcher {
  return (specifier): boolean => a(specifier) && b(specifier);
}

/**
 * Combine the rows active on one element into one effective contract.
 *
 * Allowed slots are the **intersection** across the rows that declare any — a
 * conditional row listing fewer slots narrows what the container accepts, while
 * a row that declares none (one that only turns strictness on, say) is the
 * identity and leaves the list alone. Bounds are the tightest among the rows
 * that still allow the slot; everything else unions. The result is always
 * satisfiable: a slot required by one row but intersected away by another is
 * simply neither allowed nor required, and a cross-slot reference to a slot
 * that did not survive is dropped rather than left unmeetable.
 */
export function combineSlots(
  container: string,
  rows: PreparedSlotsRow[],
): CombinedSlots {
  const declaring = rows.filter(
    (row): row is PreparedSlotsRow & { slots: Map<string, PreparedSlot> } =>
      row.slots !== undefined,
  );

  const [first, ...rest] = declaring;
  const slots =
    first === undefined ? undefined : new Map<string, PreparedSlot>();

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
      // Tightening from both ends can cross the bounds over.
      slots?.set(name, {
        ...combined,
        minCount: Math.min(combined.minCount, combined.maxCount),
      });
    }
  }

  const requires = new Map<string, string[]>();

  for (const row of rows) {
    for (const [from, to] of Object.entries(row.requires ?? {})) {
      // Drop a reference whose target the intersection removed.
      if (slots === undefined || !slots.has(from) || !slots.has(to)) {
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
    slotList: formatList([...(slots?.keys() ?? [])].map((name) => `<${name}>`)),
    requires,
    exclusive,
    strict: rows.some((row) => row.strict === true),
  };
}

/** `containerRef` is the node a `tooFew` violation reports on. */
export function evaluateSlots(
  prepared: CombinedSlots,
  root: RenderedNode,
  containerRef: Ref,
): SlotsViolation[] {
  const { container, slots, slotList } = prepared;
  const violations: SlotsViolation[] = [];

  const reportUnresolvable = (): void => {
    for (const unknownRef of root.unknownRefs) {
      violations.push({
        ref: unknownRef,
        messageId: "unresolvableChild",
        data: { container },
      });
    }
  };

  // No slot list, so nothing is an invalid child. Strictness still applies.
  if (slots === undefined) {
    if (prepared.strict) {
      reportUnresolvable();
    }

    return violations;
  }

  const hasUnknownContent = root.unknownRefs.length > 0;

  const found: { name: string; element: RenderedNode }[] = [];

  for (const child of root.children) {
    const slot = slots.get(child.name);

    if (slot === undefined || !matchesGate(slot.matcher, child.importSource)) {
      violations.push({
        ref: child.ref,
        messageId: "invalidChild",
        data: { container, slots: slotList },
      });

      continue;
    }

    found.push({ name: child.name, element: child });
  }

  for (const textRef of root.textRefs) {
    violations.push({
      ref: textRef,
      messageId: "invalidChild",
      data: { container, slots: slotList },
    });
  }

  // One count check per declared slot, over its own occurrences. Strictness
  // reports unresolvable content rather than excusing it, so the presence half
  // still runs.
  const counts = new Map<string, CountVerdict<RenderedNode>>();

  for (const slot of slots.values()) {
    const verdict = checkCountBounds(
      found
        .filter((other) => other.name === slot.name)
        .map((other) => other.element),
      slot,
      { hasUnresolvableContent: hasUnknownContent && !prepared.strict },
    );

    counts.set(slot.name, verdict);

    for (const element of verdict.tooMany) {
      violations.push({
        ref: element.ref,
        messageId: "tooMany",
        data: {
          container,
          name: slot.name,
          maxCount: countWord(slot.maxCount),
        },
      });
    }
  }

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
    reportUnresolvable();
  } else if (hasUnknownContent) {
    // Unknown content leaves presence checks unprovable, so skip them.
    return violations;
  }

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

  // A presence claim on every render path, so it shares the gate above.
  for (const preparedSlot of slots.values()) {
    if (counts.get(preparedSlot.name)?.tooFew === true) {
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
