/**
 * The children facet on v2 rows: closure checking. A closed container's direct
 * children must each be in its declared vocabulary; one that is not prompts the
 * author rather than scolds them.
 */

import type { RenderedNode } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import type { EffectiveVocabulary } from "./effective-vocabulary.js";
import type { SlotsRowV2 } from "./rows-v2.js";
import { displayName } from "./rows-v2.js";

/**
 * The closure messages. `closure` is the plain undeclared-child prompt;
 * `forbiddenSlot` and `conditionalClosure` are the branch-aware forms — a slot
 * an active branch bars, and one only an inactive branch would allow.
 */
export type ClosureMessageId =
  "closure" | "forbiddenSlot" | "conditionalClosure";

type ClosureViolation = Violation<ClosureMessageId>;

/** One container's children facet, prepared for closure checks. */
export interface PreparedClosure {
  /** The container's display name, e.g. `"Card.Heading"`. */
  container: string;
  /** Whether undeclared children are violations. */
  closed: boolean;
  /** The display names the container declares as slots. */
  vocabulary: Set<string>;
  /** The author's static intent, if any. */
  because: string | undefined;
  /** Display name → the branch witness that bars it, when an active forbid did. */
  forbidden: Map<string, { witness: string; because?: string }>;
  /** Display name → the condition an inactive branch would allow it under. */
  conditional: Map<string, { condition: string; because?: string }>;
}

/** Prepare a static (branchless) row's closure facet. */
export function prepareClosure(row: SlotsRowV2): PreparedClosure {
  return {
    container: displayName(row.match),
    closed: row.closed,
    vocabulary: new Set(row.slots.map((slot) => displayName(slot.match))),
    because: row.because,
    forbidden: new Map(),
    conditional: new Map(),
  };
}

/** Prepare closure from a per-element effective vocabulary, branches folded in. */
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

/** Append the author's intent to a message, as its own sentence, or blank. */
function trailing(because: string | undefined): string {
  return because === undefined || because === "" ? "" : ` ${because}`;
}

/**
 * The closure verdict for one container element. A child an active branch
 * forbids, or one only an inactive branch would allow, is reported whatever the
 * closure setting; every other undeclared child is reported only when closed.
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

    // A conditionally-allowed slot is only interesting where closure applies:
    // a loose container admits it anyway.
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
