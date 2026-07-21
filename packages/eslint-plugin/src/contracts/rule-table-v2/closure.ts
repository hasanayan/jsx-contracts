/**
 * The children facet on v2 rows: closure checking. A closed container's direct
 * children must each be in its declared vocabulary; one that is not prompts the
 * author rather than scolds them.
 */

import type { RenderedNode } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import type { SlotsRowV2 } from "./rows-v2.js";
import { displayName } from "./rows-v2.js";

/** The one message this facet reports. */
export type ClosureMessageId = "closure";

type ClosureViolation = Violation<ClosureMessageId>;

/** One slots row, prepared for closure checks: the container and its vocabulary. */
export interface PreparedClosure {
  /** The container's display name, e.g. `"Card.Heading"`. */
  container: string;
  /** Whether undeclared children are violations. */
  closed: boolean;
  /** The display names the container declares as slots. */
  vocabulary: Set<string>;
  /** The author's static intent, if any. */
  because: string | undefined;
}

export function prepareClosure(row: SlotsRowV2): PreparedClosure {
  return {
    container: displayName(row.match),
    closed: row.closed,
    vocabulary: new Set(row.slots.map((slot) => displayName(slot.match))),
    because: row.because,
  };
}

/**
 * The closure verdict for one container element. Every direct child outside the
 * declared vocabulary is a violation; a loose container reports nothing.
 */
export function evaluateClosure(
  prepared: PreparedClosure,
  root: RenderedNode,
): ClosureViolation[] {
  if (!prepared.closed) {
    return [];
  }

  const violations: ClosureViolation[] = [];

  for (const child of root.children) {
    if (prepared.vocabulary.has(child.name)) {
      continue;
    }

    violations.push({
      ref: child.ref,
      messageId: "closure",
      data: {
        child: child.name,
        container: prepared.container,
        because: prepared.because ?? "",
      },
    });
  }

  return violations;
}
