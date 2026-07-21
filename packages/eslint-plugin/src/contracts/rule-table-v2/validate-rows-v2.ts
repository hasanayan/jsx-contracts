/**
 * The runtime shape check for the v2 rule table, catching what the JSON schema
 * deliberately lets through — most of all a malformed match key, the one field
 * the whole engine keys off. Throws on the first malformed row.
 */

import type {
  ContractRowsV2,
  MatchKey,
  SlotBranchV2,
  SlotsRowV2,
  WhenV2,
} from "./rows-v2.js";

/** Rejects the row under validation, naming its position. */
type Fail = (problem: string) => never;

/** The match-key variants the engine can read today. */
const matchKinds = new Set(["name"]);

function validateMatch(match: unknown, subject: string, fail: Fail): void {
  if (typeof match !== "object" || match === null) {
    fail(`${subject} match key must be an object`);
  }

  const key = match as Partial<MatchKey>;

  if (typeof key.kind !== "string" || !matchKinds.has(key.kind)) {
    fail(
      `${subject} match key must have kind "name", got ${JSON.stringify(
        key.kind,
      )}`,
    );
  }

  if (typeof key.name !== "string" || key.name.length === 0) {
    fail(`${subject} match key must name an element`);
  }
}

function validateCount(count: unknown, alias: string, fail: Fail): void {
  if (count === undefined) {
    return;
  }

  if (typeof count !== "object" || count === null) {
    fail(`slot "${alias}" count must be an object`);
  }

  for (const bound of ["min", "max"] as const) {
    const value = (count as Record<string, unknown>)[bound];

    if (value !== undefined && (typeof value !== "number" || value < 0)) {
      fail(`slot "${alias}" ${bound} count must be a non-negative number`);
    }
  }
}

function validateReferences(
  refs: unknown,
  relation: string,
  alias: string,
  aliases: Set<string>,
  fail: Fail,
): void {
  if (refs === undefined) {
    return;
  }

  if (!Array.isArray(refs)) {
    fail(`slot "${alias}" ${relation} must be an array`);
  }

  for (const ref of refs as unknown[]) {
    if (typeof ref !== "string") {
      fail(`slot "${alias}" ${relation} must name sibling aliases`);
    }

    if (!aliases.has(ref)) {
      fail(
        `slot "${alias}" ${relation} names "${ref}", which is not a declared slot`,
      );
    }
  }
}

/** A condition is a prop test or an `all`/`any`/`not` over conditions. */
function validateWhen(when: unknown, subject: string, fail: Fail): void {
  if (typeof when !== "object" || when === null) {
    fail(`${subject} condition must be an object`);
  }

  const node = when as Partial<WhenV2> & Record<string, unknown>;

  if ("all" in node || "any" in node) {
    const operands = node.all ?? node.any;

    if (!Array.isArray(operands) || operands.length === 0) {
      fail(`${subject} all/any must be a non-empty array of conditions`);
    }

    for (const operand of operands as unknown[]) {
      validateWhen(operand, subject, fail);
    }

    return;
  }

  if ("not" in node) {
    validateWhen(node.not, subject, fail);

    return;
  }

  if (typeof node.prop !== "string" || node.prop.length === 0) {
    fail(`${subject} condition must name a prop`);
  }

  if (node.values !== undefined && !Array.isArray(node.values)) {
    fail(`${subject} condition values must be an array`);
  }
}

function validateBranch(
  branch: SlotBranchV2,
  label: string,
  baseAliases: Set<string>,
  fail: Fail,
): void {
  if (typeof branch !== "object") {
    fail(`${label} must be an object`);
  }

  validateWhen(branch.when, label, fail);

  if (branch.because !== undefined && typeof branch.because !== "string") {
    fail(`${label} because must be a string`);
  }

  for (const relation of ["forbidSlots", "requireSlots"] as const) {
    const refs = branch[relation];

    if (refs === undefined) {
      continue;
    }

    if (!Array.isArray(refs)) {
      fail(`${label} ${relation} must be an array`);
    }

    for (const ref of refs as unknown[]) {
      if (typeof ref !== "string" || !baseAliases.has(ref)) {
        fail(
          `${label} ${relation} names "${String(ref)}", not a declared slot`,
        );
      }
    }
  }

  for (const slot of branch.extend ?? []) {
    if (typeof slot.alias !== "string" || slot.alias.length === 0) {
      fail(`${label} extend slot must carry a non-empty alias`);
    }

    validateMatch(slot.match, `${label} extend slot "${slot.alias}"`, fail);
    validateCount(slot.count, slot.alias, fail);
  }
}

function validateSlotsRow(row: SlotsRowV2, fail: Fail): void {
  if (typeof row.closed !== "boolean") {
    fail("closed must be a boolean");
  }

  if (!Array.isArray(row.slots)) {
    fail("slots must be an array");
  }

  const aliases = new Set<string>();

  for (const slot of row.slots) {
    if (typeof slot.alias !== "string" || slot.alias.length === 0) {
      fail("a slot must carry a non-empty alias");
    }

    if (aliases.has(slot.alias)) {
      fail(`lists duplicate slot alias "${slot.alias}"`);
    }

    aliases.add(slot.alias);
    validateMatch(slot.match, `slot "${slot.alias}"`, fail);
    validateCount(slot.count, slot.alias, fail);
  }

  // A second pass: sibling references resolve against the whole map, so every
  // alias is known before a `requires`/`excludes` is checked against it.
  for (const slot of row.slots) {
    validateReferences(slot.requires, "requires", slot.alias, aliases, fail);
    validateReferences(slot.excludes, "excludes", slot.alias, aliases, fail);
  }

  if (row.branches !== undefined) {
    if (!Array.isArray(row.branches)) {
      fail("branches must be an array");
    }

    row.branches.forEach((branch, index) => {
      validateBranch(branch, `branch ${String(index)}`, aliases, fail);
    });
  }
}

/** Shape-validate a v2 rule table. Throws on the first malformed row. */
export function validateContractRowsV2(rows: ContractRowsV2): void {
  for (const [index, row] of rows.entries()) {
    const label = `v2 row ${String(index)}`;
    const fail: Fail = (problem) => {
      throw new Error(`contracts: ${label} ${problem}.`);
    };

    // Read defensively: a hand-written table can carry any facet string.
    const facet: unknown = (row as { facet: unknown }).facet;

    if (facet !== "slots") {
      fail(`has unknown facet ${JSON.stringify(facet)}`);
    }

    validateMatch(row.match, "row", fail);
    validateSlotsRow(row, fail);
  }
}
