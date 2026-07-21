import type { ImportMatcher } from "../activation/import-gate.js";
import {
  createImportMatcher,
  gateKey,
  matchesGate,
} from "../activation/import-gate.js";
import type { AncestorFact, Ref } from "../rendered-tree/rendered-tree.js";
import type { AncestorRow } from "../rule-table/rows.js";
import { normalizeForbid } from "../rule-table/shorthand.js";
import type { Violation } from "../violation.js";

/** Message ids reported by `@jsx-contracts/ancestor`. */
export type AncestorMessageId = "forbiddenAncestor";

type AncestorViolation = Violation<AncestorMessageId>;

interface PreparedForbiddenAncestor {
  name: string;
  importPath?: string;
  matcher?: ImportMatcher;
}

/** One ancestor row, prepared. Combined with the other active rows before use. */
export interface PreparedAncestorRow {
  notInside: PreparedForbiddenAncestor[];
}

/** The effective ancestor contract for one element: the combination of its active rows. */
export interface CombinedAncestor {
  component: string;
  notInside: PreparedForbiddenAncestor[];
}

export function prepareAncestorRow(row: AncestorRow): PreparedAncestorRow {
  const notInside: PreparedForbiddenAncestor[] = row.notInside.map(
    (rawEntry) => {
      const entry = normalizeForbid(rawEntry);
      const prepared: PreparedForbiddenAncestor = { name: entry.name };

      if (entry.importPath !== undefined) {
        prepared.importPath = entry.importPath;
        prepared.matcher = createImportMatcher(entry.importPath);
      }

      return prepared;
    },
  );

  return { notInside };
}

/**
 * Combine the rows active on one element into one effective contract: the union
 * of their forbidden ancestors. Entries naming the same ancestor under the same
 * gate are one statement, not two — the evaluator reports once per entry, so a
 * repeat would double the diagnostic for a single illegal nesting.
 */
export function combineAncestor(
  component: string,
  rows: PreparedAncestorRow[],
): CombinedAncestor {
  const notInside = new Map<string, PreparedForbiddenAncestor>();

  for (const row of rows) {
    for (const entry of row.notInside) {
      const key = gateKey(entry);

      if (!notInside.has(key)) {
        notInside.set(key, entry);
      }
    }
  }

  return { component, notInside: [...notInside.values()] };
}

/**
 * One violation per forbidden-ancestor entry that matches an enclosing element.
 * `ancestors` is innermost-first, so each entry reports its nearest match.
 */
export function evaluateAncestor(
  prepared: CombinedAncestor,
  ancestors: AncestorFact[],
  elementRef: Ref,
): AncestorViolation[] {
  const violations: AncestorViolation[] = [];

  for (const entry of prepared.notInside) {
    const nearest = ancestors.find(
      (ancestor) =>
        ancestor.name === entry.name &&
        (entry.matcher === undefined ||
          matchesGate(entry.matcher, ancestor.importSource)),
    );

    if (nearest !== undefined) {
      violations.push({
        ref: elementRef,
        messageId: "forbiddenAncestor",
        data: { name: prepared.component, ancestor: nearest.name },
      });
    }
  }

  return violations;
}
