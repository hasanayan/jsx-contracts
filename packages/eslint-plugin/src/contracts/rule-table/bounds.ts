/**
 * Count bounds and sibling `requires`/`excludes`. Reads only children already in
 * the vocabulary — undeclared ones are `closure.ts` — so the two never report
 * the same element twice.
 */

import type { MatchKey, SlotsRow } from "@jsx-contracts/core";
import { countWord, displayName, formatList } from "@jsx-contracts/core";

import { canCoexist } from "../rendered-tree/coexistence.js";
import type { CountBounds } from "../rendered-tree/count-bounds.js";
import {
  checkCountBounds,
  resolveBounds,
} from "../rendered-tree/count-bounds.js";
import type { RenderedNode } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import { matchesElement } from "./match.js";

export type BoundsMessageId =
  "tooMany" | "tooFew" | "requiresSlot" | "exclusiveSlots";

type BoundsViolation = Violation<BoundsMessageId>;

interface PreparedSlot {
  name: string;
  match: MatchKey;
  /** `undefined` for an unconstrained slot. */
  bounds: CountBounds | undefined;
  requires: string[];
  /** Symmetry already folded in. */
  excludes: string[];
}

export interface PreparedBounds {
  container: string;
  slots: PreparedSlot[];
}

function resolveRefs(
  aliases: string[],
  byAlias: Map<string, string>,
): string[] {
  const names: string[] = [];

  for (const alias of aliases) {
    const name = byAlias.get(alias);

    // An undeclared reference is dropped rather than left unmeetable.
    if (name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

/**
 * `excludes` symmetry is computed here once: if A excludes B, B excludes A, so
 * N-way groups fall out of per-member declarations with no group construct.
 */
export function prepareBounds(row: SlotsRow): PreparedBounds {
  const byAlias = new Map(
    row.slots.map((slot) => [slot.alias, displayName(slot.match)]),
  );

  const excludesByName = new Map<string, Set<string>>();
  const ensure = (name: string): Set<string> => {
    let set = excludesByName.get(name);

    if (set === undefined) {
      set = new Set<string>();
      excludesByName.set(name, set);
    }

    return set;
  };

  for (const slot of row.slots) {
    const name = displayName(slot.match);

    for (const other of resolveRefs(slot.excludes ?? [], byAlias)) {
      if (other === name) {
        continue;
      }

      ensure(name).add(other);
      ensure(other).add(name);
    }
  }

  const slots = row.slots.map((slot): PreparedSlot => {
    const name = displayName(slot.match);

    return {
      name,
      match: slot.match,
      bounds:
        slot.count === undefined
          ? undefined
          : resolveBounds(slot.count.min, slot.count.max),
      requires: resolveRefs(slot.requires ?? [], byAlias),
      excludes: [...(excludesByName.get(name) ?? [])],
    };
  });

  return { container: displayName(row.match), slots };
}

/**
 * `requires` and `tooFew` are presence claims, so they stand down where
 * unresolvable content could be supplying the rest.
 */
export function evaluateBounds(
  prepared: PreparedBounds,
  root: RenderedNode,
): BoundsViolation[] {
  const { container } = prepared;
  const violations: BoundsViolation[] = [];

  // Each child is attributed to the first slot whose key matches it, so a
  // gated slot never counts a same-named element from another module.
  const found: { node: RenderedNode; slot: PreparedSlot }[] = [];

  for (const child of root.children) {
    const slot = prepared.slots.find((candidate) =>
      matchesElement(candidate.match, child),
    );

    if (slot !== undefined) {
      found.push({ node: child, slot });
    }
  }

  const hasUnresolvableContent = root.unknownRefs.length > 0;

  const occurrencesOf = (name: string): RenderedNode[] =>
    found
      .filter((entry) => entry.slot.name === name)
      .map((entry) => entry.node);

  for (const slot of prepared.slots) {
    if (slot.bounds === undefined) {
      continue;
    }

    const verdict = checkCountBounds(occurrencesOf(slot.name), slot.bounds, {
      hasUnresolvableContent,
    });

    for (const element of verdict.tooMany) {
      violations.push({
        ref: element.ref,
        messageId: "tooMany",
        data: {
          container,
          name: slot.name,
          maxCount: countWord(slot.bounds.maxCount),
        },
      });
    }

    if (verdict.tooFew) {
      violations.push({
        ref: root.ref,
        messageId: "tooFew",
        data: {
          container,
          name: slot.name,
          minCount: countWord(slot.bounds.minCount),
        },
      });
    }
  }

  // A coexistence ban names only what is visible, so it runs regardless.
  for (const slot of prepared.slots) {
    if (slot.excludes.length === 0) {
      continue;
    }

    const banned = new Set(slot.excludes);

    for (const element of occurrencesOf(slot.name)) {
      const clashes = found.filter(
        (other) =>
          banned.has(other.slot.name) &&
          other.node !== element &&
          canCoexist(other.node, element),
      );

      if (clashes.length === 0) {
        continue;
      }

      const others = [...new Set(clashes.map((clash) => clash.slot.name))];

      violations.push({
        ref: element.ref,
        messageId: "exclusiveSlots",
        data: {
          container,
          name: slot.name,
          others: formatList(others.map((name) => `<${name}>`)),
        },
      });
    }
  }

  // A presence claim, so it stands down where the children are not all visible.
  if (hasUnresolvableContent) {
    return violations;
  }

  for (const slot of prepared.slots) {
    for (const required of slot.requires) {
      for (const element of occurrencesOf(slot.name)) {
        const satisfied = occurrencesOf(required).some((other) =>
          canCoexist(other, element),
        );

        if (!satisfied) {
          violations.push({
            ref: element.ref,
            messageId: "requiresSlot",
            data: { container, name: slot.name, required },
          });
        }
      }
    }
  }

  return violations;
}
