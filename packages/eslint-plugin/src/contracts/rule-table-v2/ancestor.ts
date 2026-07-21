/**
 * The ancestor facet on v2 rows: a component's placement (`notInside`) and
 * lifecycle (`deprecated`). Both are verdicts about the matched element itself —
 * `notInside` reads its enclosing elements, `deprecated` fires on any use — so
 * they share one row and one rule. No branches: the ADR keeps these base-level.
 *
 * Pure over the row and the facts it is handed: the enclosing ancestors, and the
 * element ref to report on.
 */

import type { AncestorFact, Ref } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import type { AncestorRowV2 } from "./rows-v2.js";
import { displayName } from "./rows-v2.js";

/** The messages the v2 ancestor facet reports. */
export type AncestorV2MessageId = "forbiddenAncestor" | "deprecatedComponent";

type AncestorViolation = Violation<AncestorV2MessageId>;

/** One ancestor row, prepared: the component name, its bans, and its lifecycle. */
export interface PreparedAncestor {
  component: string;
  notInside: string[];
  because: string | undefined;
  deprecated: { useInstead?: string } | undefined;
}

/** Prepare an ancestor row: resolve every forbidden ancestor to its display name. */
export function prepareAncestor(row: AncestorRowV2): PreparedAncestor {
  return {
    component: displayName(row.match),
    notInside: row.notInside.map((entry) => displayName(entry.match)),
    because: row.because,
    deprecated: row.deprecated,
  };
}

function trailing(because: string | undefined): string {
  return because === undefined || because === "" ? "" : ` ${because}`;
}

function hintText(deprecated: { useInstead?: string }): string {
  return deprecated.useInstead === undefined
    ? ""
    : ` — use \`${deprecated.useInstead}\` instead`;
}

/**
 * The ancestor verdict for one element: one violation per forbidden ancestor
 * that encloses it (nearest match), plus one deprecation notice when the
 * component is deprecated. `ancestors` is innermost-first.
 */
export function evaluateAncestor(
  prepared: PreparedAncestor,
  ancestors: AncestorFact[],
  elementRef: Ref,
): AncestorViolation[] {
  const violations: AncestorViolation[] = [];
  const because = trailing(prepared.because);

  for (const name of prepared.notInside) {
    const nearest = ancestors.find((ancestor) => ancestor.name === name);

    if (nearest !== undefined) {
      violations.push({
        ref: elementRef,
        messageId: "forbiddenAncestor",
        data: {
          component: prepared.component,
          ancestor: nearest.name,
          because,
        },
      });
    }
  }

  if (prepared.deprecated !== undefined) {
    violations.push({
      ref: elementRef,
      messageId: "deprecatedComponent",
      data: {
        component: prepared.component,
        hint: hintText(prepared.deprecated),
        because,
      },
    });
  }

  return violations;
}
