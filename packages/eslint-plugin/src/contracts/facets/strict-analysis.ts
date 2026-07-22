/**
 * With `.strictAnalysis()` on, an opaque children region reports when — and only
 * when — it intersects a rule it could break, naming both sides. Purely
 * additive: the stand-down in `bounds.ts` is untouched, so a count is never
 * invented, only its unverifiability surfaced. Granularity is region and rule,
 * which is what syntax proves.
 */

import type { OpaqueRegion } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import type { PreparedBounds } from "./bounds.js";
import type { PreparedClosure } from "./closure.js";

export type StrictMessageId = "opaqueRegion";

type StrictViolation = Violation<StrictMessageId>;

const causeProse: Record<OpaqueRegion["cause"], string> = {
  "dynamic-children": "dynamic children",
  "passthrough-children": "passthrough children",
  unresolvable: "unresolvable children",
};

/**
 * A hidden child can be an undeclared element (closure at risk) or an occurrence
 * of any bounded slot (its count at risk). A container with neither is silent.
 */
function rulesAtRisk(
  closure: PreparedClosure,
  bounds: PreparedBounds,
): string[] {
  const rules: string[] = [];

  if (closure.closed) {
    rules.push(`<${closure.container}>'s declared children`);
  }

  for (const slot of bounds.slots) {
    if (slot.bounds !== undefined) {
      rules.push(`the <${slot.name}> count`);
    }
  }

  return rules;
}

/** One finding per (region, rule at risk), each naming both sides. */
export function evaluateStrictAnalysis(
  strict: boolean,
  closure: PreparedClosure,
  bounds: PreparedBounds,
  regions: OpaqueRegion[],
): StrictViolation[] {
  if (!strict || regions.length === 0) {
    return [];
  }

  const rules = rulesAtRisk(closure, bounds);

  if (rules.length === 0) {
    return [];
  }

  const violations: StrictViolation[] = [];

  for (const region of regions) {
    for (const rule of rules) {
      violations.push({
        ref: region.ref,
        messageId: "opaqueRegion",
        data: {
          rule,
          cause: causeProse[region.cause],
          region: region.text,
        },
      });
    }
  }

  return violations;
}
