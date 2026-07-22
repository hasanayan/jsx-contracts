/**
 * Condition-to-English: the witness clause a violation carries ("because this
 * `Card` has `onClick`"). Kept apart from row assembly so ADR 0006's
 * documentation renderer can share the exact same prose. Pure over the AST — the
 * `subject` is named in every clause so the reader sees which element it reads.
 */

import { formatList } from "../message-text.js";

import type { When } from "./rows.js";

interface PropTest {
  prop: string;
  values?: (string | number | boolean)[];
}

function code(text: string | number | boolean): string {
  return `\`${String(text)}\``;
}

function renderProp(test: PropTest, subject: string, negated: boolean): string {
  if (test.values === undefined) {
    return negated
      ? `${code(subject)} has no ${code(test.prop)}`
      : `${code(subject)} has ${code(test.prop)}`;
  }

  const verb = negated ? "is not" : "is";

  return `${code(subject)}'s ${code(test.prop)} ${verb} ${formatList(
    test.values.map(code),
    "or",
  )}`;
}

function render(when: When, subject: string): string {
  if ("all" in when) {
    return formatList(
      when.all.map((operand) => render(operand, subject)),
      "and",
    );
  }

  if ("any" in when) {
    return formatList(
      when.any.map((operand) => render(operand, subject)),
      "or",
    );
  }

  if ("not" in when) {
    return renderNegated(when.not, subject);
  }

  return renderProp(when, subject, false);
}

function renderNegated(when: When, subject: string): string {
  // A negated composite has no clean English inversion, so it is wrapped.
  if ("prop" in when) {
    return renderProp(when, subject, true);
  }

  return `not (${render(when, subject)})`;
}

/** Composites join with "and"/"or"; a negated prop test reads as "has no"/"is not". */
export function renderCondition(when: When, subject: string): string {
  return render(when, subject);
}
