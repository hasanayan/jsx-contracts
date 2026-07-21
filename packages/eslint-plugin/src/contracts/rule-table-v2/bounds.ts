/**
 * The counted-and-related half of the v2 slots facet: count bounds, sibling
 * `requires`, and sibling `excludes`. Closure (undeclared children) is
 * `closure.ts`; this module reads only the children already in the vocabulary,
 * so the two never report the same element twice.
 *
 * Count and coexistence semantics are the core's canonical ones — a bare slot
 * is 0–∞ (no `count` at all), a written bound resolves through `resolveBounds`,
 * and every check is branch-aware through `canCoexist`.
 */

import { countWord, formatList } from "../message-text.js";
import { canCoexist } from "../rendered-tree/coexistence.js";
import type { CountBounds } from "../rendered-tree/count-bounds.js";
import {
  checkCountBounds,
  resolveBounds,
} from "../rendered-tree/count-bounds.js";
import type { RenderedNode } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import type { SlotsRowV2 } from "./rows-v2.js";
import { displayName } from "./rows-v2.js";

/** The bounds/requires/excludes messages the v2 slots facet reports. */
export type BoundsMessageId =
  "tooMany" | "tooFew" | "requiresSlot" | "exclusiveSlots";

type BoundsViolation = Violation<BoundsMessageId>;

/** One slot, prepared: its display name and everything checked over it. */
interface PreparedSlotV2 {
  /** The slot element's display name, e.g. `"Card.Heading.Text"`. */
  name: string;
  /** The resolved count bounds, or `undefined` for an unconstrained slot. */
  bounds: CountBounds | undefined;
  /** Display names this slot requires alongside it. */
  requires: string[];
  /** Display names this slot excludes, symmetry already folded in. */
  excludes: string[];
}

/** One slots row, prepared for the bounds/requires/excludes pass. */
export interface PreparedBounds {
  container: string;
  slots: PreparedSlotV2[];
}

/** Resolve a slot's alias references to the display names the engine matches on. */
function resolveRefs(
  aliases: string[],
  byAlias: Map<string, string>,
): string[] {
  const names: string[] = [];

  for (const alias of aliases) {
    const name = byAlias.get(alias);

    // A reference the map does not declare is dropped rather than left
    // unmeetable — the same forgiving direction the old facet took.
    if (name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

/**
 * Prepare a slots row for the bounds pass. `excludes` symmetry is computed here
 * once: if A excludes B, B excludes A, so N-way groups fall out of the
 * per-member declarations without any group construct.
 */
export function prepareBounds(row: SlotsRowV2): PreparedBounds {
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

  const slots = row.slots.map((slot): PreparedSlotV2 => {
    const name = displayName(slot.match);

    return {
      name,
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
 * The bounds/requires/excludes verdict for one container element. Counts run
 * over each slot's own occurrences; `requires` and `tooFew` are presence claims
 * that stand down where unresolvable content could be supplying the rest.
 */
export function evaluateBounds(
  prepared: PreparedBounds,
  root: RenderedNode,
): BoundsViolation[] {
  const { container } = prepared;
  const violations: BoundsViolation[] = [];

  const vocabulary = new Set(prepared.slots.map((slot) => slot.name));

  // Only declared children; an undeclared one is closure's to report.
  const found = root.children.filter((child) => vocabulary.has(child.name));
  const hasUnresolvableContent = root.unknownRefs.length > 0;

  const occurrencesOf = (name: string): RenderedNode[] =>
    found.filter((child) => child.name === name);

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

  // `excludes` is a coexistence ban: it names only what is visible, so it runs
  // regardless of unresolvable content.
  for (const slot of prepared.slots) {
    if (slot.excludes.length === 0) {
      continue;
    }

    const banned = new Set(slot.excludes);

    for (const element of occurrencesOf(slot.name)) {
      const clashes = found.filter(
        (other) =>
          banned.has(other.name) &&
          other !== element &&
          canCoexist(other, element),
      );

      if (clashes.length === 0) {
        continue;
      }

      const others = [...new Set(clashes.map((clash) => clash.name))];

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

  // `requires` is a presence claim, so it stands down where the linter cannot
  // see the rest of the children.
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
