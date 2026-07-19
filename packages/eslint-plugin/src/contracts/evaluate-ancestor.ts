// Pure evaluation of a component's forbidden-ancestor contract. The adapter
// matches the element (dotted tag + import gate) and walks its chain of
// enclosing JSX elements, innermost-first; this evaluator reasons only over the
// collected ancestor facts. Only the forbidden direction ships: an illegal
// nesting visible in the file is definitely wrong (sound per-file). Requiring an
// ancestor is deliberately not enforced — it is unsound per-file.

import type { ImportMatcher } from "./import-matcher.js";
import { createImportMatcher, matchesGate } from "./import-matcher.js";
import type { Ref, Violation } from "./model.js";
import type { AncestorRow } from "./payload.js";
import { normalizeForbid } from "./validate.js";

/** Message ids reported by `@jsx-contracts/ancestor`. */
export type AncestorMessageId = "forbiddenAncestor";

type AncestorViolation = Violation<AncestorMessageId>;

// One enclosing JSX element, as the adapter reports it: its dotted tag and the
// module its root identifier resolves to (null for a non-import — the lenient
// case, matched by any gate).
export interface AncestorFact {
  name: string;
  importSource: string | null;
}

// `importPath` is kept beside the compiled matcher because it — not the
// function — is what two rows must share for their entries to be the same
// statement rather than two.
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
      const key = `${entry.name}\n${entry.importPath ?? ""}`;

      if (!notInside.has(key)) {
        notInside.set(key, entry);
      }
    }
  }

  return { component, notInside: [...notInside.values()] };
}

// One violation per forbidden-ancestor entry that matches an enclosing element.
// `ancestors` is innermost-first, so the `find` reports the nearest match and
// stops; separate entries matching different ancestors each report once.
export function evaluateAncestor(
  prepared: CombinedAncestor,
  ancestors: AncestorFact[],
  elementRef: Ref,
): AncestorViolation[] {
  const violations: AncestorViolation[] = [];

  for (const entry of prepared.notInside) {
    const match = ancestors.find(
      (ancestor) =>
        ancestor.name === entry.name &&
        (entry.matcher === undefined ||
          matchesGate(entry.matcher, ancestor.importSource)),
    );

    if (match !== undefined) {
      violations.push({
        ref: elementRef,
        messageId: "forbiddenAncestor",
        data: { name: prepared.component, ancestor: match.name },
      });
    }
  }

  return violations;
}
