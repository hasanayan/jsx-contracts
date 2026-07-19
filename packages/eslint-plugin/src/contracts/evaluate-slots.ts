// Pure evaluation of a container's children facet. Check order is significant:
// it fixes which violation is reported first.

import type { ContainerConfig } from "@jsx-contracts/helpers";

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

export interface PreparedContainer {
  container: string;
  slots: Map<string, PreparedSlot>;
  slotNames: Set<string>;
  slotList: string;
  containerMatcher: ImportMatcher;
  requires?: Record<string, string>;
  exclusive?: [string[], string[]][];
  strict?: boolean;
}

// Count-bound defaults: neither bound means at most one; only minCount lifts
// the upper bound; only maxCount keeps a lower bound of zero.
export function prepareContainer(config: ContainerConfig): PreparedContainer {
  const containerMatcher = createImportMatcher(config.importPath);
  const slots = new Map<string, PreparedSlot>();

  for (const rawSlot of config.slots) {
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

  const prepared: PreparedContainer = {
    container: config.container,
    slots,
    slotNames: new Set(slots.keys()),
    slotList: formatList([...slots.keys()].map((name) => `<${name}>`)),
    containerMatcher,
  };

  if (config.requires !== undefined) {
    prepared.requires = config.requires;
  }

  if (config.exclusive !== undefined) {
    prepared.exclusive = config.exclusive;
  }

  if (config.strict !== undefined) {
    prepared.strict = config.strict;
  }

  return prepared;
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
  prepared: PreparedContainer,
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
  for (const [groupA, groupB] of prepared.exclusive ?? []) {
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

  for (const slot of found) {
    const required = prepared.requires?.[slot.name];

    if (required === undefined) {
      continue;
    }

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
