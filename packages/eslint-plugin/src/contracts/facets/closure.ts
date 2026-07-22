/**
 * A closed container's direct children must each be in its declared vocabulary;
 * one that is not prompts the author rather than scolding them.
 */

import type { MatchKey, SlotsRow } from "@jsx-contracts/core";
import { displayName } from "@jsx-contracts/core";

import { matchesElement } from "../match.js";
import type { RenderedNode } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import type {
  EffectiveVocabulary,
  GatedByName,
} from "./effective-vocabulary.js";

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
  /** Keys, not names: a child of a declared name from another module is not declared. */
  vocabulary: MatchKey[];
  because: string | undefined;
  /** The witnesses of the active branches barring a name, one per gate. */
  forbidden: GatedByName<{
    match: MatchKey;
    witness: string;
    because?: string;
  }>;
  /** The conditions an inactive branch would allow a name under, one per gate. */
  conditional: GatedByName<{
    match: MatchKey;
    condition: string;
    because?: string;
  }>;
}

/** The entry in `name`'s bucket that this child actually is, if any. */
function gatedFor<T extends { match: MatchKey }>(
  bucket: GatedByName<T>,
  child: RenderedNode,
): T | undefined {
  return bucket
    .get(child.name)
    ?.find((entry) => matchesElement(entry.match, child));
}

export function prepareClosure(row: SlotsRow): PreparedClosure {
  return {
    container: displayName(row.match),
    closed: row.closed,
    vocabulary: row.slots.map((slot) => slot.match),
    because: row.because,
    forbidden: new Map(),
    conditional: new Map(),
  };
}

export function closureOf(vocab: EffectiveVocabulary): PreparedClosure {
  return {
    container: vocab.container,
    closed: vocab.closed,
    vocabulary: vocab.slots.map((slot) => slot.match),
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
    if (prepared.vocabulary.some((match) => matchesElement(match, child))) {
      continue;
    }

    const barred = gatedFor(prepared.forbidden, child);

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

    const gated = gatedFor(prepared.conditional, child);

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
