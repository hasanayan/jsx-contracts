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

// Every rejection is prefixed with the row's position and identity, so a table
// of any size points at the row that has to change.
function rowLabel(row: ContractRow, index: number): string {
  return `row ${String(index)} (${row.facet} <${row.component}>)`;
}

function fail(row: ContractRow, index: number, problem: string): never {
  throw new Error(`contracts: ${rowLabel(row, index)} ${problem}.`);
}

function checkBounds(
  row: ContractRow,
  index: number,
  subject: string,
  min: number | undefined,
  max: number | undefined,
  minKey: string,
  maxKey: string,
): void {
  if (min !== undefined && (!Number.isInteger(min) || min < 0)) {
    fail(row, index, `${subject} ${minKey} must be a non-negative integer`);
  }

  if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
    fail(row, index, `${subject} ${maxKey} must be a positive integer`);
  }

  if (min !== undefined && max !== undefined && min > max) {
    fail(row, index, `${subject} ${minKey} exceeds ${maxKey}`);
  }
}

function validateWhen(row: ContractRow, index: number): void {
  if (typeof row.when === "object" && row.when.values?.length === 0) {
    fail(row, index, `when "${row.when.prop}" values must not be empty`);
  }
}

function validateSlotsRow(row: SlotsRow, index: number): void {
  const slots = new Set<string>();

  for (const rawSlot of row.slots) {
    const slot = normalizeSlot(rawSlot);

    // Within one row a repeated slot name is still ill-formed: the prepared
    // slot map is keyed by name, so the second declaration would silently win.
    // Two *rows* declaring the same slot are fine — that is accumulation.
    if (slots.has(slot.name)) {
      fail(row, index, `lists duplicate slot "${slot.name}"`);
    }

    slots.add(slot.name);

    checkBounds(
      row,
      index,
      `slot "${slot.name}"`,
      slot.minCount,
      slot.maxCount,
      "minCount",
      "maxCount",
    );
  }

  // Cross-slot references resolve against the slots declared in the same row.
  // After merging a reference may point at a slot another active row
  // intersected away; the merge drops it rather than reporting, because
  // whether that combination is reachable cannot be decided here.
  const references = [
    ...Object.entries(row.requires ?? {}).flat(),
    ...(row.exclusive ?? []).flat(2),
  ];

  for (const reference of references) {
    if (!slots.has(reference)) {
      fail(row, index, `references "${reference}", which it does not declare`);
    }
  }
}

function validateSubtreeRow(row: SubtreeRow, index: number): void {
  if (row.forbid?.length === 0) {
    fail(row, index, "forbid must not be empty");
  }

  if (row.forbidProps?.length === 0) {
    fail(row, index, "forbidProps must not be empty");
  }

  if (row.require?.length === 0) {
    fail(row, index, "require must not be empty");
  }

  if (
    (row.forbid?.length ?? 0) === 0 &&
    (row.forbidProps?.length ?? 0) === 0 &&
    (row.require?.length ?? 0) === 0
  ) {
    fail(row, index, "must forbid an element or prop, or require a descendant");
  }

  for (const entry of row.require ?? []) {
    if (entry.name.length === 0) {
      fail(row, index, "require entry must name an element");
    }

    checkBounds(
      row,
      index,
      `require "${entry.name}"`,
      entry.min,
      entry.max,
      "min",
      "max",
    );
  }
}

function validatePropsRow(row: PropsRow, index: number): void {
  const declares =
    (row.required?.length ?? 0) > 0 ||
    (row.exclusive?.length ?? 0) > 0 ||
    Object.keys(row.deprecated ?? {}).length > 0 ||
    row.deprecatedComponent !== undefined;

  if (!declares) {
    fail(row, index, "must declare at least one prop contract");
  }

  for (const entry of row.required ?? []) {
    if (Array.isArray(entry) && entry.length === 0) {
      fail(row, index, "has an empty required group");
    }
  }

  for (const [groupA, groupB] of row.exclusive ?? []) {
    if (groupA.length === 0 || groupB.length === 0) {
      fail(row, index, "has an empty exclusive group");
    }
  }
}

function validateAncestorRow(row: AncestorRow, index: number): void {
  if (row.notInside.length === 0) {
    fail(row, index, "notInside must not be empty");
  }

  for (const rawEntry of row.notInside) {
    if (normalizeForbid(rawEntry).name.length === 0) {
      fail(row, index, "notInside entry must name an element");
    }
  }
}

/** Shape-validate a rule table. Throws on the first malformed row. */
export function validateContractRows(rows: ContractRows): void {
  for (const [index, row] of rows.entries()) {
    validateWhen(row, index);

    switch (row.facet) {
      case "slots": {
        validateSlotsRow(row, index);
        break;
      }

      case "subtree": {
        validateSubtreeRow(row, index);
        break;
      }

      case "props": {
        validatePropsRow(row, index);
        break;
      }

      case "ancestor": {
        validateAncestorRow(row, index);
        break;
      }
    }
  }
}
