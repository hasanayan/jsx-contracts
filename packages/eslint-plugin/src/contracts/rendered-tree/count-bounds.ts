/**
 * How often a part may occur, and how a count of occurrences is judged against
 * that. Whether two occurrences count at once is `coexistence.ts`.
 */

import { allPairwiseCoexist } from "./coexistence.js";
import type { Branch, Branched } from "./rendered-tree.js";

function subsetsOfSize<T>(items: T[], size: number): T[][] {
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

function conditionalIdOf(branch: Branch): string {
  return branch.slice(0, branch.indexOf(":"));
}

function sideOf(branch: Branch): "consequent" | "alternate" {
  return branch.endsWith("consequent") ? "consequent" : "alternate";
}

/** The count guaranteed on every render path, over every branch assignment. */
function minimumGuaranteedCount(occurrences: Branched[]): number {
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

export interface CountBounds {
  minCount: number;
  maxCount: number;
}

/**
 * A part asserts only what it writes: a lower bound alone is unbounded above, an
 * upper bound alone leaves the part optional, neither is optional-and-at-most-one.
 */
export function resolveBounds(
  minCount: number | undefined,
  maxCount: number | undefined,
): CountBounds {
  return {
    minCount: minCount ?? 0,
    maxCount: maxCount ?? (minCount === undefined ? 1 : Infinity),
  };
}

export interface CountContext {
  /** Content that may render further occurrences no pass can see. */
  hasUnresolvableContent: boolean;
}

export interface CountVerdict<Occurrence> {
  tooMany: Occurrence[];
  tooFew: boolean;
}

/**
 * max only ever names what is visible, so it always runs. min is a presence
 * claim over every render path, so it reads the guaranteed count and stands down
 * where unresolvable content could be supplying the rest.
 */
export function checkCountBounds<Occurrence extends Branched>(
  occurrences: Occurrence[],
  bounds: CountBounds,
  context: CountContext,
): CountVerdict<Occurrence> {
  const tooMany: Occurrence[] = [];

  if (bounds.maxCount !== Infinity) {
    for (const [position, occurrence] of occurrences.entries()) {
      const exceeds = subsetsOfSize(
        occurrences.slice(0, position),
        bounds.maxCount,
      ).some((subset) => allPairwiseCoexist([...subset, occurrence]));

      if (exceeds) {
        tooMany.push(occurrence);
      }
    }
  }

  return {
    tooMany,
    tooFew:
      bounds.minCount > 0 &&
      !context.hasUnresolvableContent &&
      minimumGuaranteedCount(occurrences) < bounds.minCount,
  };
}
