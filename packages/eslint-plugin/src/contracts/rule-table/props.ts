/**
 * Per-prop `required`/`requires`/`excludes`/`deprecated`, plus the
 * contract-level `requiresAnyOf` groups. Pure over the row and an activeness
 * predicate — which branches hold is the rule's call.
 */

import { formatList } from "../message-text.js";
import type { PropFact, Ref } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import { renderCondition } from "./condition-prose.js";
import type { PropDeprecation, PropSpec, PropsRow } from "./rows.js";
import { displayName } from "./rows.js";

export type PropsMessageId =
  | "requiredProp"
  | "requiredAnyProp"
  | "requiresProp"
  | "exclusiveProps"
  | "deprecatedProp";

type PropsViolation = Violation<PropsMessageId>;

/** `witness` and `because` are absent on a base spec, present on a branch's. */
interface PreparedPropSpec {
  prop: string;
  required: boolean;
  requires: string[];
  excludes: string[];
  deprecated: PropDeprecation | undefined;
  witness: string | undefined;
  because: string | undefined;
}

export interface PreparedProps {
  component: string;
  base: PreparedPropSpec[];
  /** Each group is satisfied by any one member. */
  requiresAnyOf: string[][];
  /** Aligned with the row's branches, for the activeness call by index. */
  branches: PreparedPropSpec[][];
}

function prepareSpec(
  spec: PropSpec,
  witness: string | undefined,
  because: string | undefined,
): PreparedPropSpec {
  return {
    prop: spec.prop,
    required: spec.required ?? false,
    requires: spec.requires ?? [],
    excludes: spec.excludes ?? [],
    deprecated: spec.deprecated,
    witness,
    because,
  };
}

// Renders each branch's witness once.
export function prepareProps(row: PropsRow): PreparedProps {
  const component = displayName(row.match);

  return {
    component,
    base: row.props.map((spec) => prepareSpec(spec, undefined, undefined)),
    requiresAnyOf: (row.requiresAnyOf ?? []).map((group) => [...group]),
    branches: (row.branches ?? []).map((branch) =>
      branch.props.map((spec) =>
        prepareSpec(
          spec,
          renderCondition(branch.when, component),
          branch.because,
        ),
      ),
    ),
  };
}

function whenClause(witness: string | undefined): string {
  return witness === undefined ? "" : ` when ${witness}`;
}

function trailing(because: string | undefined): string {
  return because === undefined || because === "" ? "" : ` ${because}`;
}

function hintText(deprecated: PropDeprecation): string {
  return deprecated.useInstead === undefined
    ? ""
    : ` — use \`${deprecated.useInstead}\` instead`;
}

function quoted(props: string[]): string {
  return formatList(props.map((prop) => `\`${prop}\``));
}

/**
 * `requiresAnyOf` and `required`/`requires` are presence claims and stand down
 * under a spread; `excludes` and `deprecated` name what is written, so they run
 * regardless.
 */
export function evaluateProps(
  prepared: PreparedProps,
  isActive: (branchIndex: number) => boolean,
  facts: PropFact[],
  hasSpread: boolean,
  elementRef: Ref,
): PropsViolation[] {
  const { component } = prepared;
  const violations: PropsViolation[] = [];

  const present = new Set<string>();
  const factByName = new Map<string, PropFact>();

  for (const fact of facts) {
    if (fact.present) {
      present.add(fact.name);
    }

    factByName.set(fact.name, fact);
  }

  const refOf = (name: string): Ref => factByName.get(name)?.ref ?? elementRef;

  const specs: PreparedPropSpec[] = [...prepared.base];

  prepared.branches.forEach((branchSpecs, index) => {
    if (isActive(index)) {
      specs.push(...branchSpecs);
    }
  });

  for (const spec of specs) {
    const when = whenClause(spec.witness);
    const because = trailing(spec.because);

    if (spec.required && !hasSpread && !present.has(spec.prop)) {
      violations.push({
        ref: elementRef,
        messageId: "requiredProp",
        data: { component, prop: spec.prop, when, because },
      });
    }

    if (present.has(spec.prop) && !hasSpread) {
      const missing = spec.requires.filter((name) => !present.has(name));

      if (missing.length > 0) {
        violations.push({
          ref: refOf(spec.prop),
          messageId: "requiresProp",
          data: {
            component,
            prop: spec.prop,
            required: quoted(missing),
            when,
            because,
          },
        });
      }
    }

    if (present.has(spec.prop)) {
      const clashes = spec.excludes.filter((name) => present.has(name));

      if (clashes.length > 0) {
        violations.push({
          ref: refOf(spec.prop),
          messageId: "exclusiveProps",
          data: {
            component,
            prop: spec.prop,
            others: quoted(clashes),
            when,
            because,
          },
        });
      }
    }

    // Fires on the prop being written at all, whatever its value.
    if (spec.deprecated !== undefined && factByName.has(spec.prop)) {
      violations.push({
        ref: refOf(spec.prop),
        messageId: "deprecatedProp",
        data: {
          component,
          prop: spec.prop,
          hint: hintText(spec.deprecated),
          when,
          because,
        },
      });
    }
  }

  if (!hasSpread) {
    for (const group of prepared.requiresAnyOf) {
      if (!group.some((name) => present.has(name))) {
        violations.push({
          ref: elementRef,
          messageId: "requiredAnyProp",
          data: { component, props: quoted(group) },
        });
      }
    }
  }

  return violations;
}
