/**
 * The runtime shape check every rule runs over its rule table, catching what
 * the JSON schema deliberately lets through. Throws on the first malformed row.
 */

import type {
  AncestorRow,
  ContractRow,
  ContractRows,
  PropsRow,
  SlotsRow,
  SubtreeRow,
  WhenCondition,
} from "./rows.js";
import { normalizeForbid, normalizeSlot } from "./shorthand.js";

/** Rejects the row under validation, naming its position and identity. */
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

function validateWhen(when: WhenCondition, fail: Fail): void {
  if (typeof when === "string") {
    if (when.length === 0) {
      fail("when must name a prop");
    }

    return;
  }

  // Exactly one arm, at every depth.
  const arms = (["prop", "all", "any", "not"] as const).filter(
    (arm) => arm in when,
  );

  if (arms.length > 1) {
    fail(`when must carry one of prop/all/any/not, not ${arms.join(" and ")}`);
  }

  if ("all" in when || "any" in when) {
    const operator = "all" in when ? "all" : "any";
    const operands = "all" in when ? when.all : when.any;

    if (!Array.isArray(operands) || operands.length === 0) {
      fail(`when ${operator} must not be empty`);
    }

    for (const operand of operands) {
      validateWhen(operand, fail);
    }

    return;
  }

  if ("not" in when) {
    validateWhen(when.not, fail);

    return;
  }

  if (typeof when.prop !== "string" || when.prop.length === 0) {
    fail("when must name a prop");
  }

  if (when.values?.length === 0) {
    fail(`when "${when.prop}" values must not be empty`);
  }
}

function validateSlotsRow(row: SlotsRow, fail: Fail): void {
  // Absent `slots` is the identity; empty would intersect the container's list
  // away.
  if (row.slots?.length === 0) {
    fail("slots must not be empty");
  }

  if (
    row.slots === undefined &&
    row.requires === undefined &&
    row.exclusive === undefined &&
    row.strict === undefined
  ) {
    fail("must declare slots, a cross-slot rule, or strictness");
  }

  const slots = new Set<string>();

  for (const rawSlot of row.slots ?? []) {
    const slot = normalizeSlot(rawSlot);

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

    if (row.when !== undefined) {
      validateWhen(row.when, fail);
    }

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
