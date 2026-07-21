import type { CompiledContracts } from "../compile/compiled-contracts.js";
import { makeContracts } from "../compile/compiled-contracts.js";

/**
 * Merge any number of contracts — `contract()` builders, or the results of
 * other `mergeContracts` calls — into one. The result is itself a
 * contract, so merges nest; call `rules()` once at the end, in your ESLint
 * config.
 *
 * Throws when two arguments cover the same component. Rows accumulate, so two
 * separate contracts for one container intersect their slot lists to nothing
 * and the author is told nothing — whereas declaring both slots in one chain
 * yields a single row allowing both. A component is identified by its dotted
 * tag alone: gates are globs, so two rows naming one component under different
 * gates can both match one element, and both are combined.
 *
 * @example
 * const widgets = mergeContracts(widgetTray, widgetOverflow);
 * export const contracts = mergeContracts(widgets, menu, layout);
 * // eslint.config.js → rules: contracts.rules()
 */
export function mergeContracts(
  ...contracts: CompiledContracts[]
): CompiledContracts {
  const covered = new Set<string>();

  for (const entry of contracts) {
    for (const component of new Set(entry.rows.map((row) => row.component))) {
      if (covered.has(component)) {
        throw new Error(
          `mergeContracts: component "${component}" is covered by two ` +
            "contracts. Declare everything about a component in one chain — " +
            "separate contracts for one component narrow each other to nothing.",
        );
      }

      covered.add(component);
    }
  }

  return makeContracts(contracts.flatMap((entry) => entry.rows));
}
