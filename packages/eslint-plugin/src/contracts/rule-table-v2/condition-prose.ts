/**
 * Condition-to-English rendering: the distinct message layer that turns a v2
 * condition tree into the witness clause a violation carries ("because this
 * `Card` has `onClick`"). Kept apart from row assembly so ADR 0006's
 * documentation renderer can share the exact same prose.
 *
 * Pure over the condition AST — no element, no props. The `subject` is the
 * display name of the element the condition reads against; every clause names
 * it so the reader sees which element the branch turns on.
 */

import { formatList } from "../message-text.js";

import type { WhenV2 } from "./rows-v2.js";

/** One prop test, positive or negated. */
interface PropTest {
  prop: string;
  values?: (string | number | boolean)[];
}

function code(text: string | number | boolean): string {
  return `\`${String(text)}\``;
}

/** Join literals as an or-list: "`a`", "`a` or `b`", "`a`, `b` or `c`". */
function orList(values: (string | number | boolean)[]): string {
  const rendered = values.map(code);

  if (rendered.length <= 1) {
    return rendered.join("");
  }

  return `${rendered.slice(0, -1).join(", ")} or ${rendered.at(-1) ?? ""}`;
}

function renderProp(test: PropTest, subject: string, negated: boolean): string {
  if (test.values === undefined) {
    return negated
      ? `${code(subject)} has no ${code(test.prop)}`
      : `${code(subject)} has ${code(test.prop)}`;
  }

  const verb = negated ? "is not" : "is";

  return `${code(subject)}'s ${code(test.prop)} ${verb} ${orList(test.values)}`;
}

function renderPositive(when: WhenV2, subject: string): string {
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

function renderNegated(when: WhenV2, subject: string): string {
  // A negated prop test reads naturally ("has no", "is not"); a negated
  // composite has no clean English inversion, so it is wrapped verbatim.
  if ("prop" in when) {
    return renderProp(when, subject, true);
  }

  return `not (${renderPositive(when, subject)})`;
}

function render(when: WhenV2, subject: string): string {
  return renderPositive(when, subject);
}

/**
 * Render a v2 condition as an English clause naming `subject`. Composites join
 * with "and"/"or"; a negated prop test reads as "has no"/"is not", a negated
 * composite is wrapped in "not (…)".
 */
export function renderCondition(when: WhenV2, subject: string): string {
  return render(when, subject);
}
