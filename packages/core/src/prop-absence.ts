/**
 * The prop-absence rule at the value level: which condition literals a contract
 * treats as an absent prop. A `false`, or the `undefined` identifier carried as
 * the string `"undefined"` — the two forms an author writes to mean "not there".
 * Which literals mean absent is a semantic of the contract format; reading a JSX
 * attribute down to one of them is the plugin's syntactic concern.
 */

import type { ConditionValue } from "./rows.js";

export function matchesWhileAbsent(value: ConditionValue): boolean {
  return value === false || value === "undefined";
}
