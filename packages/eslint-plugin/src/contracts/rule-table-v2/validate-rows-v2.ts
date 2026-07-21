/**
 * The runtime shape check for the v2 rule table, catching what the JSON schema
 * deliberately lets through — most of all a malformed match key, the one field
 * the whole engine keys off. Throws on the first malformed row.
 */

import type { ContractRowsV2, MatchKey, SlotsRowV2 } from "./rows-v2.js";

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
