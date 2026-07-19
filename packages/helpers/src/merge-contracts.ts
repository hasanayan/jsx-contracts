// Merging: several compiled contracts read as one rule table. See CONTEXT.md
// for the terms.

import type { CompiledContracts } from "./rule-table.js";
import { makeContracts } from "./rule-table.js";

/**
 * Merge any number of contracts — from `defineContracts`, a `contract()`
 * builder, or other `mergeContracts` calls — into one. The result is itself a
 * contract, so merges nest; call `rules()` once at the end, in your ESLint
 * config.
 *
 * @example
 * const widgets = mergeContracts(widgetTray, widgetSubtree);
 * export const contracts = mergeContracts(widgets, menu, layout);
 * // eslint.config.js → rules: contracts.rules()
 */
export function mergeContracts(
  ...contracts: CompiledContracts[]
): CompiledContracts {
  return makeContracts(contracts.flatMap((entry) => entry.rows));
}
