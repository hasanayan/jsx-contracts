/**
 * The props facet on v2 rows: per-prop `required`/`requires`/`excludes`/
 * `deprecated`, plus the contract-level `requiresAnyOf` at-least-one-of groups.
 * Branch-aware — a branch's prop specs apply only while its condition holds, and
 * a violation one drives carries the branch witness and `because`, so the reader
 * sees which branch turned the rule on.
 *
 * Pure over the row and an activeness predicate: which branches hold is the
 * rule's call (it reads the element's props through the canonical condition
 * pool), so this module stays free of any prop-reading of its own beyond the
 * facts it is handed.
 */

import { formatList } from "../message-text.js";
import type { PropFact, Ref } from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import { renderCondition } from "./condition-prose.js";
import type { PropSpecV2, PropsRowV2 } from "./rows-v2.js";
import { displayName } from "./rows-v2.js";

/** Every message the v2 props facet reports. */
export type PropsV2MessageId =
  | "requiredProp"
  | "requiredAnyProp"
  | "requiresProp"
  | "exclusiveProps"
  | "deprecatedProp";

type PropsViolation = Violation<PropsV2MessageId>;

/**
 * One prop spec, prepared: the constraints plus the branch context that gates
 * it. `witness` and `because` are absent on a base spec and carry the condition
 * prose and intent when the spec came from a branch.
 */
interface PreparedPropSpec {
  prop: string;
  required: boolean;
  requires: string[];
  excludes: string[];
  deprecated: { useInstead?: string } | undefined;
  witness: string | undefined;
  because: string | undefined;
}

/** One props row, prepared: base specs, at-least-one-of groups, and branches. */
export interface PreparedProps {
  component: string;
  /** The specs that always apply, regardless of any branch. */
  base: PreparedPropSpec[];
  /** Contract-level at-least-one-of groups; each is satisfied by any member. */
  requiresAnyOf: string[][];
  /** Per-branch specs, aligned with the row's branches for the activeness call. */
  branches: PreparedPropSpec[][];
}

function prepareSpec(
  spec: PropSpecV2,
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

/** Prepare a props row, rendering each branch's witness once. */
export function prepareProps(row: PropsRowV2): PreparedProps {
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

function hintText(deprecated: { useInstead?: string }): string {
  return deprecated.useInstead === undefined
    ? ""
    : ` — use \`${deprecated.useInstead}\` instead`;
}

function quoted(props: string[]): string {
  return formatList(props.map((prop) => `\`${prop}\``));
}

/**
 * The props verdict for one element. `isActive` decides each branch by index;
 * base specs always apply, and an active branch's specs apply alongside them,
 * each reported with its own witness. `requiresAnyOf` and `required`/`requires`
 * are presence claims that stand down where a spread could be supplying a prop;
 * `excludes` and `deprecated` name what is written, so they run regardless.
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

    // A spread may carry any prop, so an absence is unprovable.
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

    // Deprecated fires on the prop being written at all, whatever its value.
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
