/**
 * The two shorthand forms a hand-written row may use in place of a full object:
 * a bare slot name, and a bare forbidden-element name. Normalized on the way
 * into every reader, so nothing below sees the string form.
 */

import type { ForbiddenElement, SlotConfig } from "./rows.js";

export function normalizeSlot(slot: string | SlotConfig): SlotConfig {
  return typeof slot === "string" ? { name: slot } : slot;
}

export function normalizeForbid(
  entry: string | ForbiddenElement,
): ForbiddenElement {
  return typeof entry === "string" ? { name: entry } : entry;
}
