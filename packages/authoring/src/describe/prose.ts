/**
 * The declarative prose helper over the description IR (ADR 0006): "just give me
 * sentences" as one call. Voice is declarative — "exactly one", not the
 * comparative "expects exactly 1, found 3" a violation carries. Elements read as
 * their JSX tags (`<Card.Heading.Text>`); props and prop references read as code
 * (`` `href` ``), the plain names they are matched by.
 *
 * The count-word and list formatters come from `@jsx-contracts/core`, the shared
 * format layer ADR 0006 folds into both this helper and the plugin's messages.
 */

import { countWord, formatList, renderCondition } from "@jsx-contracts/core";

import type {
  BaseSection,
  ContractDescription,
  DescribedBranch,
  DescribedContract,
  DescribedProp,
  DescribedSlot,
  SlotBounds,
} from "./description.js";

function tag(name: string): string {
  return `<${name}>`;
}

function code(name: string): string {
  return `\`${name}\``;
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

/** The verb phrases of a prop rule, e.g. "is required; excludes `onClick`". */
function propQualifiers(prop: DescribedProp): string {
  const qualifiers: string[] = [];

  if (prop.required === true) {
    qualifiers.push("is required");
  }

  if (prop.requires !== undefined) {
    qualifiers.push(`requires ${formatList(prop.requires.map(code))}`);
  }

  if (prop.excludes !== undefined) {
    qualifiers.push(`excludes ${formatList(prop.excludes.map(code))}`);
  }

  if (prop.deprecated !== undefined) {
    qualifiers.push(
      prop.deprecated.useInstead !== undefined
        ? `is deprecated — use ${code(prop.deprecated.useInstead)} instead`
        : "is deprecated",
    );
  }

  return qualifiers.join("; ");
}

function propSentence(subject: string, prop: DescribedProp): string {
  return `${tag(subject)}'s ${code(prop.name)} prop ${propQualifiers(prop)}.`;
}

/** The base facts as declarative sentences, one facet after another. */
function baseSentences(subject: string, base: BaseSection): string[] {
  const sentences: string[] = [];
  const { children } = base;

  if (children !== undefined) {
    sentences.push(
      children.closed
        ? `${tag(subject)} is closed: only its declared children may appear.`
        : `${tag(subject)} is loose: children beyond those declared are allowed.`,
    );

    if (children.strictAnalysis === true) {
      sentences.push(
        `${tag(subject)} uses strict analysis: an opaque region that could break a rule is reported, not assumed fine.`,
      );
    }

    for (const slot of children.slots) {
      sentences.push(slotSentence(subject, slot));
    }
  }

  for (const prop of base.props ?? []) {
    sentences.push(propSentence(subject, prop));
  }

  for (const group of base.requiresAnyOf ?? []) {
    sentences.push(
      `${tag(subject)} requires at least one of ${formatList(group.map(code), "or")}.`,
    );
  }

  for (const descendant of base.descendants ?? []) {
    sentences.push(
      `${tag(subject)} requires ${quantifier(descendant.bounds)}${tag(descendant.name)} somewhere below.`,
    );
  }

  if (base.forbidsDescendants !== undefined) {
    sentences.push(
      `${tag(subject)} forbids ${formatList(base.forbidsDescendants.map(tag))} anywhere below.`,
    );
  }

  if (base.forbidsDescendantProps !== undefined) {
    sentences.push(
      `${tag(subject)} forbids ${formatList(base.forbidsDescendantProps.map(code))} on any descendant.`,
    );
  }

  if (base.notInside !== undefined) {
    sentences.push(
      `${tag(subject)} may not appear inside ${formatList(base.notInside.map(tag), "or")}.`,
    );
  }

  if (base.deprecated !== undefined) {
    sentences.push(
      base.deprecated.useInstead !== undefined
        ? `${tag(subject)} is deprecated — use ${tag(base.deprecated.useInstead)} instead.`
        : `${tag(subject)} is deprecated.`,
    );
  }

  return sentences;
}

/**
 * A branch as one declarative sentence. The condition is phrased through the
 * shared `@jsx-contracts/core` renderer — the same code path the plugin's
 * violation messages use — so a condition can never read two ways. The delta
 * clauses stay in the docs' declarative voice, one after another across every
 * facet the branch touches.
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

  for (const prop of branch.props ?? []) {
    clauses.push(`its ${code(prop.name)} prop ${propQualifiers(prop)}`);
  }

  if (branch.forbidsDescendants !== undefined) {
    clauses.push(
      `forbids ${formatList(branch.forbidsDescendants.map(tag))} anywhere below`,
    );
  }

  if (branch.forbidsDescendantProps !== undefined) {
    clauses.push(
      `forbids ${formatList(branch.forbidsDescendantProps.map(code))} on any descendant`,
    );
  }

  const body = clauses.join("; ");
  const because = branch.because !== undefined ? ` (${branch.because})` : "";

  return `When ${renderCondition(branch.when, subject)}: ${body}${because}.`;
}

function contractSentences(contract: DescribedContract): string[] {
  const sentences = baseSentences(contract.subject, contract.base);

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
