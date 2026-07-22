/**
 * A closed container's direct children must each be in its declared vocabulary;
 * one that is not prompts the author rather than scolding them.
 */

import type { RenderedNode } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import type { EffectiveVocabulary } from "./effective-vocabulary.js";
import type { SlotsRow } from "./rows.js";
import { displayName } from "./rows.js";

/**
 * `forbiddenSlot` and `conditionalClosure` are the branch-aware forms: a slot an
 * active branch bars, and one only an inactive branch would allow.
 */
export type ClosureMessageId =
  "closure" | "forbiddenSlot" | "conditionalClosure";

type ClosureViolation = Violation<ClosureMessageId>;

export interface PreparedClosure {
  container: string;
  closed: boolean;
  vocabulary: Set<string>;
  because: string | undefined;
  /** Display name → the witness of the active branch barring it. */
  forbidden: Map<string, { witness: string; because?: string }>;
  /** Display name → the condition an inactive branch would allow it under. */
  conditional: Map<string, { condition: string; because?: string }>;
}

export function prepareClosure(row: SlotsRow): PreparedClosure {
  return {
    container: displayName(row.match),
    closed: row.closed,
    vocabulary: new Set(row.slots.map((slot) => displayName(slot.match))),
    because: row.because,
    forbidden: new Map(),
    conditional: new Map(),
  };
}

export function closureOf(vocab: EffectiveVocabulary): PreparedClosure {
  return {
    container: vocab.container,
    closed: vocab.closed,
    vocabulary: new Set(vocab.slots.map((slot) => displayName(slot.match))),
    because: vocab.because,
    forbidden: vocab.forbidden,
    conditional: vocab.conditional,
  };
}

function trailing(because: string | undefined): string {
  return because === undefined || because === "" ? "" : ` ${because}`;
}

/**
 * A branch-forbidden or conditionally-allowed child reports whatever the closure
 * setting; every other undeclared child reports only when closed.
 */
export function evaluateClosure(
  prepared: PreparedClosure,
  root: RenderedNode,
): ClosureViolation[] {
  const violations: ClosureViolation[] = [];

  for (const child of root.children) {
    if (prepared.vocabulary.has(child.name)) {
      continue;
    }

    const barred = prepared.forbidden.get(child.name);

    if (barred !== undefined) {
      violations.push({
        ref: child.ref,
        messageId: "forbiddenSlot",
        data: {
          child: child.name,
          container: prepared.container,
          witness: barred.witness,
          because: trailing(barred.because),
        },
      });

      continue;
    }

    // A loose container admits it anyway.
    if (!prepared.closed) {
      continue;
    }

    const gated = prepared.conditional.get(child.name);

    if (gated !== undefined) {
      violations.push({
        ref: child.ref,
        messageId: "conditionalClosure",
        data: {
          child: child.name,
          container: prepared.container,
          condition: gated.condition,
          because: trailing(gated.because),
        },
      });

      continue;
    }

    violations.push({
      ref: child.ref,
      messageId: "closure",
      data: {
        child: child.name,
        container: prepared.container,
        because: trailing(prepared.because),
      },
    });
  }

  return violations;
}
