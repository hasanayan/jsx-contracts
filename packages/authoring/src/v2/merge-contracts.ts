/**
 * `mergeContracts` for the v2 surface: combine rule sets authored across files
 * into one, throwing on a cross-file duplicate — one component, one contract,
 * wherever it is authored.
 */

import type { ContractRowsV2 } from "@jsx-contracts/eslint-plugin";

import type { RuleSetV2 } from "./define-contracts.js";
import { makeRuleSet } from "./define-contracts.js";

/**
 * Combine v2 rule sets. A component contracted in two of them is an error — the
 * same duplicate the collector rejects within one file — so a component's
 * contract is whole wherever it lives.
 */
export function mergeContracts(...sets: RuleSetV2[]): RuleSetV2 {
  const seen = new Set<string>();
  const rows: ContractRowsV2 = [];

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
