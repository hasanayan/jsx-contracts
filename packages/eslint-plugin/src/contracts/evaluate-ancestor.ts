// Pure evaluation of a component's forbidden-ancestor contract. The adapter
// matches the element (dotted tag + import gate) and walks its chain of
// enclosing JSX elements, innermost-first; this evaluator reasons only over the
// collected ancestor facts. Only the forbidden direction ships: an illegal
// nesting visible in the file is definitely wrong (sound per-file). Requiring an
// ancestor is deliberately not enforced — it is unsound per-file.

import type { AncestorConfig } from "@jsx-contracts/helpers";

import type { ImportMatcher } from "./import-matcher.js";
import { createImportMatcher, matchesGate } from "./import-matcher.js";
import type { Ref, Violation } from "./model.js";
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

interface PreparedForbiddenAncestor {
  name: string;
  matcher?: ImportMatcher;
}

export interface PreparedAncestor {
  component: string;
  // The constrained component's own import gate. Consumed by the adapter to
  // decide whether a rendered <component> is in scope; the evaluator does not
  // read it.
  matcher: ImportMatcher;
  notInside: PreparedForbiddenAncestor[];
}

export function prepareAncestor(config: AncestorConfig): PreparedAncestor {
  const notInside: PreparedForbiddenAncestor[] = config.notInside.map(
    (rawEntry) => {
      const entry = normalizeForbid(rawEntry);
      const prepared: PreparedForbiddenAncestor = { name: entry.name };

      if (entry.importPath !== undefined) {
        prepared.matcher = createImportMatcher(entry.importPath);
      }

      return prepared;
    },
  );

  return {
    component: config.component,
    matcher: createImportMatcher(config.importPath),
    notInside,
  };
}

// One violation per forbidden-ancestor entry that matches an enclosing element.
// `ancestors` is innermost-first, so the `find` reports the nearest match and
// stops; separate entries matching different ancestors each report once.
export function evaluateAncestor(
  prepared: PreparedAncestor,
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
