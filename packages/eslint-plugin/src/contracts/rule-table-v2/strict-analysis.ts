/**
 * Analysis strictness on the v2 slots facet. By default an opaque children
 * region — `{items.map(…)}`, `{props.children}`, an unresolvable variable — is
 * assumed fine. With `.strictAnalysis()` on, this reports when — and only
 * when — such a region intersects a rule it could break, naming both the rule
 * at risk and the blinding expression.
 *
 * Purely additive: the blanket stand-down in `bounds.ts` is untouched, so a
 * count is never invented, only its unverifiability surfaced. Granularity is
 * the region and the rule — what syntax proves — never per-prop precision.
 */

import type { OpaqueRegion } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import type { PreparedBounds } from "./bounds.js";
import type { PreparedClosure } from "./closure.js";

/** The one message the strict-analysis facet reports. */
export type StrictMessageId = "opaqueRegion";

type StrictViolation = Violation<StrictMessageId>;

/** Internal cause → the noun phrase a message uses for the blinding region. */
const causeProse: Record<OpaqueRegion["cause"], string> = {
  "dynamic-children": "dynamic children",
  "passthrough-children": "passthrough children",
  unresolvable: "unresolvable children",
};

/**
 * The rules an opaque children region could break for one container: its
 * closure, when closed, and each slot that carries a count bound. A hidden
 * child can be an undeclared element (closure at risk) or an occurrence of any
 * bounded slot (its count at risk); a container with neither rule is silent.
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

/**
 * The strict-analysis verdict for one container. Silent unless the switch is on
 * and an opaque region actually meets a rule it could break; then one finding
 * per (region, rule at risk), each naming both sides.
 */
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
