/**
 * Whether a match key matches an element. The one place a key's gate is read —
 * every facet asks here rather than comparing names itself, so "which element is
 * this rule about" has a single answer.
 */

import type { MatchKey } from "@jsx-contracts/core";

import type { ImportMatcher } from "./activation/import-gate.js";
import { createImportMatcher } from "./activation/import-gate.js";

/** All matching reads of an element: what it is called and where it came from. */
export interface ElementIdentity {
  name: string;
  /** The specifier the tag's root binding was imported from, `null` for a non-import. */
  importSource: string | null;
}

// Compiling a glob is the expensive half, and a table reuses a handful of gates
// across every row.
const compiled = new Map<string, ImportMatcher>();

function matcherFor(from: string): ImportMatcher {
  let matcher = compiled.get(from);

  if (matcher === undefined) {
    matcher = createImportMatcher(from);
    compiled.set(from, matcher);
  }

  return matcher;
}

/**
 * An ungated key admits any origin. A gated one admits only a resolved import
 * specifier that matches it: a locally declared component of the same name is
 * not the gated component, so it does not match.
 */
export function gateAllows(
  match: MatchKey,
  importSource: string | null,
): boolean {
  if (match.from === undefined) {
    return true;
  }

  return importSource !== null && matcherFor(match.from)(importSource);
}

export function matchesElement(
  match: MatchKey,
  element: ElementIdentity,
): boolean {
  return element.name === match.name && gateAllows(match, element.importSource);
}
