// Pure evaluation of a component's element-local prop contracts. The adapter
// matches the element (dotted tag + import gate) and detects spreads; this
// evaluator reasons only over the collected prop facts. Check order fixes which
// violation is reported first: required, then exclusive, then deprecated.

import { formatList } from "./format.js";
import type { PropFact, Ref, Violation } from "./model.js";
import type { PropsRow } from "./payload.js";

/** Message ids reported by `@jsx-contracts/props`. */
export type PropsMessageId =
  | "requiredProp"
  | "requiredAnyProp"
  | "exclusiveProps"
  | "deprecatedProp"
  | "deprecatedComponent";

type PropsViolation = Violation<PropsMessageId>;

/** One props row, prepared. Combined with the other active rows before use. */
export interface PreparedPropsRow {
  required: (string | string[])[];
  exclusive: [string[], string[]][];
  deprecated: [string, string | true][];
  deprecatedComponent: string | true | undefined;
}

/** The effective prop contract for one element: the combination of its active rows. */
export interface CombinedProps {
  component: string;
  required: (string | string[])[];
  exclusive: [string[], string[]][];
  deprecated: [string, string | true][];
  deprecatedComponent?: string | true;
}

export function preparePropsRow(row: PropsRow): PreparedPropsRow {
  return {
    required: row.required ?? [],
    exclusive: row.exclusive ?? [],
    deprecated: Object.entries(row.deprecated ?? {}),
    deprecatedComponent: row.deprecatedComponent,
  };
}

/**
 * Combine the rows active on one element into one effective contract.
 *
 * Everything unions: a props row states obligations, and two rows stating them
 * both apply. Identical statements collapse — a requirement or an exclusive
 * pair repeated across rows would otherwise report twice for one written prop.
 * The first row to deprecate a prop (or the component) fixes its hint.
 */
export function combineProps(
  component: string,
  rows: PreparedPropsRow[],
): CombinedProps {
  const required: (string | string[])[] = [];
  const exclusive: [string[], string[]][] = [];
  const deprecated = new Map<string, string | true>();
  const seen = new Set<string>();

  // A prop group is a set, not a sequence, so it is sorted before keying:
  // otherwise `["a", "b"]` and `["b", "a"]` survive as two statements and report
  // twice for one written prop. An exclusive pair's two sides keep their order —
  // the evaluator reports the left side's props, so swapping them says something
  // different.
  const fresh = (key: string): boolean => {
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  };

  const groupKey = (group: string[]): string =>
    JSON.stringify([...group].sort());

  const combined: CombinedProps = {
    component,
    required,
    exclusive,
    deprecated: [],
  };

  for (const row of rows) {
    for (const entry of row.required) {
      const key =
        typeof entry === "string"
          ? `required prop\n${entry}`
          : `required group\n${groupKey(entry)}`;

      if (fresh(key)) {
        required.push(entry);
      }
    }

    for (const pair of row.exclusive) {
      if (fresh(`exclusive\n${groupKey(pair[0])}\n${groupKey(pair[1])}`)) {
        exclusive.push(pair);
      }
    }

    for (const [prop, hint] of row.deprecated) {
      if (!deprecated.has(prop)) {
        deprecated.set(prop, hint);
      }
    }

    if (
      row.deprecatedComponent !== undefined &&
      combined.deprecatedComponent === undefined
    ) {
      combined.deprecatedComponent = row.deprecatedComponent;
    }
  }

  combined.deprecated = [...deprecated];

  return combined;
}

function hintText(replacement: string | true): string {
  return typeof replacement === "string"
    ? ` — use \`${replacement}\` instead`
    : "";
}

function quoted(props: string[]): string {
  return formatList(props.map((prop) => `\`${prop}\``));
}

// `elementRef` reports required and component-level violations; a written prop's
// own `ref` reports exclusive and prop-level deprecations, falling back to the
// element when the fact carries none.
export function evaluateProps(
  prepared: CombinedProps,
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

  // A spread may carry any prop, so an absence is unprovable: skip required.
  // Exclusive and deprecated still run — they report only what is written.
  if (!hasSpread) {
    for (const entry of prepared.required) {
      if (typeof entry === "string") {
        if (!present.has(entry)) {
          violations.push({
            ref: elementRef,
            messageId: "requiredProp",
            data: { component, prop: entry },
          });
        }

        continue;
      }

      if (!entry.some((prop) => present.has(prop))) {
        violations.push({
          ref: elementRef,
          messageId: "requiredAnyProp",
          data: { component, props: quoted(entry) },
        });
      }
    }
  }

  for (const [groupA, groupB] of prepared.exclusive) {
    const presentB = groupB.filter((prop) => present.has(prop));

    if (presentB.length === 0) {
      continue;
    }

    const others = quoted(presentB);

    for (const prop of groupA) {
      if (present.has(prop)) {
        violations.push({
          ref: refOf(prop),
          messageId: "exclusiveProps",
          data: { component, prop, others },
        });
      }
    }
  }

  // A deprecated prop fires when the attribute is written at all, whatever its
  // value — writing it is the deprecated usage.
  for (const [prop, replacement] of prepared.deprecated) {
    if (factByName.has(prop)) {
      violations.push({
        ref: refOf(prop),
        messageId: "deprecatedProp",
        data: { component, prop, hint: hintText(replacement) },
      });
    }
  }

  if (prepared.deprecatedComponent !== undefined) {
    violations.push({
      ref: elementRef,
      messageId: "deprecatedComponent",
      data: { component, hint: hintText(prepared.deprecatedComponent) },
    });
  }

  return violations;
}
