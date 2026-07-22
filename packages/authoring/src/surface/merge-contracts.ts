import type { ContractRows } from "@jsx-contracts/core";

import type { RuleSet } from "./define-contracts.js";
import { makeRuleSet, subjectKey } from "./define-contracts.js";

/**
 * Combine rule sets authored across files. A subject contracted in two of them
 * throws — the same duplicate the collector rejects within one file. Identity is
 * the (name, gate) pair, so one name under two gates is two subjects and merges.
 */
export function mergeContracts(...sets: RuleSet[]): RuleSet {
  const seen = new Set<string>();
  const rows: ContractRows = [];

  for (const set of sets) {
    // A subject spans several rows (one per facet); collapse to its identity
    // before checking, so a multi-facet contract is not its own duplicate.
    const subjects = new Map<
      string,
      { name: string; from: string | undefined }
    >();

    for (const row of set.rows) {
      subjects.set(subjectKey(row.match.name, row.match.from), {
        name: row.match.name,
        from: row.match.from,
      });
    }

    for (const [key, { name, from }] of subjects) {
      if (seen.has(key)) {
        throw new Error(
          `mergeContracts: duplicate contract for "${name}" under gate ` +
            `"${from ?? ""}" — one component, one contract, wherever it is ` +
            "authored.",
        );
      }

      seen.add(key);
    }

    rows.push(...set.rows);
  }

  return makeRuleSet(rows);
}
