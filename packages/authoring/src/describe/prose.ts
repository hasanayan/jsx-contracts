/**
 * The declarative prose helper over the description IR (ADR 0006): "just give me
 * sentences" as one call. Voice is declarative — "exactly one", not the
 * comparative "expects exactly 1, found 3" a violation carries. Elements read as
 * their JSX tags (`<Card.Heading.Text>`), the display strings the IR already
 * carries.
 *
 * The shared display-name/condition-to-English layer that ADR 0006 folds into
 * both this helper and the plugin's messages arrives with conditions; a base
 * contract needs none of it yet, so the small formatters here stand alone.
 */

import type {
  ContractDescription,
  DescribedContract,
  DescribedSlot,
  SlotBounds,
} from "./description.js";

/** Spells one as a word; larger counts as digits, matching the plugin's voice. */
function countWord(count: number): string {
  return count === 1 ? "one" : String(count);
}

/** Joins display names as "a, b and c". */
function formatList(items: string[], conjunction = "and"): string {
  if (items.length <= 1) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

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

function slotSentence(subject: string, slot: DescribedSlot): string {
  const qualifiers: string[] = [];

  if (slot.requires !== undefined) {
    qualifiers.push(`requires ${formatList(slot.requires.map(tag))}`);
  }

  if (slot.excludes !== undefined) {
    qualifiers.push(`excludes ${formatList(slot.excludes.map(tag))}`);
  }

  const tail = qualifiers.length > 0 ? ` — ${qualifiers.join("; ")}` : "";

  return `${tag(subject)} accepts ${quantifier(slot.bounds)}${tag(slot.name)}${tail}.`;
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

  return sentences;
}

/**
 * Renders the IR to declarative sentences, one contract after another in order.
 * Print them with `.join("\n")`.
 */
export function toSentences(description: ContractDescription): string[] {
  return description.contracts.flatMap(contractSentences);
}
