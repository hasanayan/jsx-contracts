// The runtime validators for the rule table, authoritative for hand-written
// payloads. Config-load rejections throw rather than reporting, so they name
// the offending row and the problem: a consumer hand-writing a table fixes it
// without reading this source.
//
// There is deliberately no duplicate guard here. Rows accumulate — many rows
// may name one component in one facet — so "duplicate component" is the normal
// case rather than an error. Guarding against two independent contracts for one
// component is @jsx-contracts/helpers' job, via `mergeContracts`. Hand-written
// tables are unguarded, and that is accepted.

import type {
  AncestorRow,
  ContractRow,
  ContractRows,
  ForbiddenElement,
  PropsRow,
  SlotConfig,
  SlotsRow,
  SubtreeRow,
} from "./payload.js";

export function normalizeSlot(slot: string | SlotConfig): SlotConfig {
  return typeof slot === "string" ? { name: slot } : slot;
}

export function normalizeForbid(
  entry: string | ForbiddenElement,
): ForbiddenElement {
  return typeof entry === "string" ? { name: entry } : entry;
}

/**
 * Rejects the row under validation. Bound to one row so the position and
 * identity are stamped once: a table of any size points at the row that has to
 * change.
 */
type Fail = (problem: string) => never;

function failFor(row: ContractRow, index: number): Fail {
  const label = `row ${String(index)} (${row.facet} <${row.component}>)`;

  return (problem) => {
    throw new Error(`contracts: ${label} ${problem}.`);
  };
}

function checkBounds(
  fail: Fail,
  subject: string,
  min: number | undefined,
  max: number | undefined,
  minKey: string,
  maxKey: string,
): void {
  if (min !== undefined && (!Number.isInteger(min) || min < 0)) {
    fail(`${subject} ${minKey} must be a non-negative integer`);
  }

  if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
    fail(`${subject} ${maxKey} must be a positive integer`);
  }

  if (min !== undefined && max !== undefined && min > max) {
    fail(`${subject} ${minKey} exceeds ${maxKey}`);
  }
}

function validateWhen(row: ContractRow, fail: Fail): void {
  if (typeof row.when === "object" && row.when.values?.length === 0) {
    fail(`when "${row.when.prop}" values must not be empty`);
  }
}

function validateSlotsRow(row: SlotsRow, fail: Fail): void {
  // Allowed slots are the intersection across active rows, so a row declaring
  // none is not the identity — it would empty the container's slot list and
  // reject every child. A row that has nothing to say about slots is a row that
  // should not be in the table.
  if (row.slots.length === 0) {
    fail("slots must not be empty");
  }

  const slots = new Set<string>();

  for (const rawSlot of row.slots) {
    const slot = normalizeSlot(rawSlot);

    // Within one row a repeated slot name is still ill-formed: the prepared
    // slot map is keyed by name, so the second declaration would silently win.
    // Two *rows* declaring the same slot are fine — that is accumulation.
    if (slots.has(slot.name)) {
      fail(`lists duplicate slot "${slot.name}"`);
    }

    slots.add(slot.name);

    checkBounds(
      fail,
      `slot "${slot.name}"`,
      slot.minCount,
      slot.maxCount,
      "minCount",
      "maxCount",
    );
  }

  // Cross-slot references resolve against the slots declared in the same row.
  // After merging a reference may point at a slot another active row
  // intersected away; the combination drops it rather than reporting, because
  // whether that combination is reachable cannot be decided here.
  const references = [
    ...Object.entries(row.requires ?? {}).flat(),
    ...(row.exclusive ?? []).flat(2),
  ];

  for (const reference of references) {
    if (!slots.has(reference)) {
      fail(`references "${reference}", which it does not declare`);
    }
  }
}

function validateSubtreeRow(row: SubtreeRow, fail: Fail): void {
  if (row.forbid?.length === 0) {
    fail("forbid must not be empty");
  }

  if (row.forbidProps?.length === 0) {
    fail("forbidProps must not be empty");
  }

  if (row.require?.length === 0) {
    fail("require must not be empty");
  }

  if (
    (row.forbid?.length ?? 0) === 0 &&
    (row.forbidProps?.length ?? 0) === 0 &&
    (row.require?.length ?? 0) === 0
  ) {
    fail("must forbid an element or prop, or require a descendant");
  }

  for (const entry of row.require ?? []) {
    if (entry.name.length === 0) {
      fail("require entry must name an element");
    }

    checkBounds(
      fail,
      `require "${entry.name}"`,
      entry.min,
      entry.max,
      "min",
      "max",
    );
  }
}

function validatePropsRow(row: PropsRow, fail: Fail): void {
  const declares =
    (row.required?.length ?? 0) > 0 ||
    (row.exclusive?.length ?? 0) > 0 ||
    Object.keys(row.deprecated ?? {}).length > 0 ||
    row.deprecatedComponent !== undefined;

  if (!declares) {
    fail("must declare at least one prop contract");
  }

  for (const entry of row.required ?? []) {
    if (Array.isArray(entry) && entry.length === 0) {
      fail("has an empty required group");
    }
  }

  for (const [groupA, groupB] of row.exclusive ?? []) {
    if (groupA.length === 0 || groupB.length === 0) {
      fail("has an empty exclusive group");
    }
  }
}

function validateAncestorRow(row: AncestorRow, fail: Fail): void {
  if (row.notInside.length === 0) {
    fail("notInside must not be empty");
  }

  for (const rawEntry of row.notInside) {
    if (normalizeForbid(rawEntry).name.length === 0) {
      fail("notInside entry must name an element");
    }
  }
}

/** Shape-validate a rule table. Throws on the first malformed row. */
export function validateContractRows(rows: ContractRows): void {
  for (const [index, row] of rows.entries()) {
    const fail = failFor(row, index);

    validateWhen(row, fail);

    switch (row.facet) {
      case "slots": {
        validateSlotsRow(row, fail);
        break;
      }

      case "subtree": {
        validateSubtreeRow(row, fail);
        break;
      }

      case "props": {
        validatePropsRow(row, fail);
        break;
      }

      case "ancestor": {
        validateAncestorRow(row, fail);
        break;
      }
    }
  }
}
