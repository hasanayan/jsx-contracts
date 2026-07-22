/**
 * Placement (`notInside`) and lifecycle (`deprecated`). Both are verdicts about
 * the matched element itself, so they share one row and one rule. No branches —
 * the ADR keeps these base-level.
 */

import type { AncestorRow, MatchKey } from "@jsx-contracts/core";
import { displayName } from "@jsx-contracts/core";

import { matchesElement } from "../match.js";
import type { AncestorFact, Ref } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

export type AncestorMessageId = "forbiddenAncestor" | "deprecatedComponent";

type AncestorViolation = Violation<AncestorMessageId>;

export interface PreparedAncestor {
  component: string;
  notInside: MatchKey[];
  because: string | undefined;
  deprecated: { useInstead?: string } | undefined;
}

export function prepareAncestor(row: AncestorRow): PreparedAncestor {
  return {
    component: displayName(row.match),
    notInside: row.notInside.map((entry) => entry.match),
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

/** `ancestors` is innermost-first, so the nearest forbidden match is the one named. */
export function evaluateAncestor(
  prepared: PreparedAncestor,
  ancestors: AncestorFact[],
  elementRef: Ref,
): AncestorViolation[] {
  const violations: AncestorViolation[] = [];
  const because = trailing(prepared.because);

  for (const match of prepared.notInside) {
    const nearest = ancestors.find((ancestor) =>
      matchesElement(match, ancestor),
    );

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
