/**
 * Which occurrences in a rendered tree can render alongside one another. Two
 * elements coexist unless one sits opposite the other in some ternary; the
 * count and exclusivity checks are branch-aware because of it.
 */

import type { Branch, Branched } from "./rendered-tree.js";

/** False only when the two sit in opposite branches of one ternary. */
export function canCoexist(a: Branched, b: Branched): boolean {
  return !a.branches.some((branch) => {
    const [conditionalId, side] = branch.split(":");
    const otherSide = side === "consequent" ? "alternate" : "consequent";

    return b.branches.includes(`${conditionalId}:${otherSide}` as Branch);
  });
}

/** True when every pair among the elements can render alongside the others. */
export function allPairwiseCoexist(elements: Branched[]): boolean {
  return elements.every((element, index) =>
    elements.slice(index + 1).every((other) => canCoexist(element, other)),
  );
}
