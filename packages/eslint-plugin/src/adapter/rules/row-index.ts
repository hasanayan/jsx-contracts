/**
 * How every facet rule finds the rows an element is under: index by tag name,
 * which a tag gives cheaply, then admit only the rows whose gate the element's
 * own import satisfies.
 */

import type { MatchKey } from "@jsx-contracts/core";

import { gateAllows } from "../../contracts/rule-table/match.js";

export function push<T>(index: Map<string, T[]>, name: string, value: T): void {
  const existing = index.get(name);

  if (existing === undefined) {
    index.set(name, [value]);
  } else {
    existing.push(value);
  }
}

export function admitting<T>(
  candidates: T[] | undefined,
  importSource: string | null,
  matchOf: (candidate: T) => MatchKey,
): T[] {
  if (candidates === undefined) {
    return [];
  }

  return candidates.filter((candidate) =>
    gateAllows(matchOf(candidate), importSource),
  );
}
