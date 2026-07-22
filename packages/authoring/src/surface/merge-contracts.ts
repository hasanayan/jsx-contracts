import type { ContractRows } from "@jsx-contracts/eslint-plugin";

import type { RuleSet } from "./define-contracts.js";
import { makeRuleSet } from "./define-contracts.js";

/**
 * Combine rule sets authored across files. A component contracted in two of them
 * throws — the same duplicate the collector rejects within one file.
 */
export function mergeContracts(...sets: RuleSet[]): RuleSet {
  const seen = new Set<string>();
  const rows: ContractRows = [];

  for (const set of sets) {
    for (const row of set.rows) {
      const name = row.match.name;

      if (seen.has(name)) {
        throw new Error(
          `mergeContracts: duplicate contract for "${name}" — one component, ` +
            "one contract, wherever it is authored.",
        );
      }

      seen.add(name);
      rows.push(row);
    }
  }

  return makeRuleSet(rows);
}
