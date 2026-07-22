/**
 * The declarative prose helper over the description IR (ADR 0006): "just give me
 * sentences" as one call. Voice is declarative — "exactly one", not the
 * comparative "expects exactly 1, found 3" a violation carries. Elements read as
 * their JSX tags (`<Card.Heading.Text>`), the display strings the IR already
 * carries.
 *
 * The count-word and list formatters come from `@jsx-contracts/core`, the shared
 * format layer ADR 0006 folds into both this helper and the plugin's messages.
 */

import { countWord, formatList, renderCondition } from "@jsx-contracts/core";

import type {
  ContractDescription,
  DescribedBranch,
  DescribedContract,
  DescribedSlot,
  SlotBounds,
} from "./description.js";

function tag(name: string): string {
  return `<${name}>`;
}

/** The occurrence quantifier, with a trailing space, or "" when unconstrained. */
function quantifier(bounds: SlotBounds | undefined): string {
  if (bounds === undefined) {
    return "";
  }

  switch (bounds.kind) {
    case "exactly":
      return `exactly ${countWord(bounds.count)} `;

    case "atLeast":
      return `at least ${countWord(bounds.count)} `;

    case "atMost":
      return `at most ${countWord(bounds.count)} `;

    case "between":
      return `between ${String(bounds.min)} and ${String(bounds.max)} `;
  }
}

/** "at most one <Card.Media> — requires <…>", the quantified slot with its qualifiers. */
function slotClause(slot: DescribedSlot): string {
  const qualifiers: string[] = [];

  if (slot.requires !== undefined) {
    qualifiers.push(`requires ${formatList(slot.requires.map(tag))}`);
  }

  if (slot.excludes !== undefined) {
    qualifiers.push(`excludes ${formatList(slot.excludes.map(tag))}`);
  }

  const tail = qualifiers.length > 0 ? ` — ${qualifiers.join("; ")}` : "";

  return `${quantifier(slot.bounds)}${tag(slot.name)}${tail}`;
}

function slotSentence(subject: string, slot: DescribedSlot): string {
  return `${tag(subject)} accepts ${slotClause(slot)}.`;
}

/**
 * A branch as one declarative sentence. The condition is phrased through the
 * shared `@jsx-contracts/core` renderer — the same code path the plugin's
 * violation messages use — so a condition can never read two ways. The delta
 * clauses stay in the docs' declarative voice.
 */
function branchSentence(subject: string, branch: DescribedBranch): string {
  const clauses: string[] = [];

  if (branch.forbids !== undefined) {
    clauses.push(`forbids ${formatList(branch.forbids.map(tag))}`);
  }

  if (branch.requires !== undefined) {
    clauses.push(`requires ${formatList(branch.requires.map(tag))}`);
  }

  for (const slot of branch.extend ?? []) {
    clauses.push(`also accepts ${slotClause(slot)}`);
  }

  const body = clauses.join("; ");
  const because = branch.because !== undefined ? ` (${branch.because})` : "";

  return `When ${renderCondition(branch.when, subject)}: ${body}${because}.`;
}

function contractSentences(contract: DescribedContract): string[] {
  const sentences: string[] = [];
  const { base } = contract;

  if (base === undefined) {
    return sentences;
  }

  sentences.push(
    base.closed
      ? `${tag(contract.subject)} is closed: only its declared children may appear.`
      : `${tag(contract.subject)} is loose: children beyond those declared are allowed.`,
  );

  for (const slot of base.slots) {
    sentences.push(slotSentence(contract.subject, slot));
  }

  for (const branch of contract.branches ?? []) {
    sentences.push(branchSentence(contract.subject, branch));
  }

  return sentences;
}

/**
 * Renders the IR to declarative sentences, one contract after another in order.
 * Print them with `.join("\n")`.
 */
export function toSentences(description: ContractDescription): string[] {
  return description.contracts.flatMap(contractSentences);
}
