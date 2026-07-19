// Pure evaluation of a component's element-local prop contracts. The adapter
// matches the element (dotted tag + import gate) and detects spreads; this
// evaluator reasons only over the collected prop facts. Check order fixes which
// violation is reported first: required, then exclusive, then deprecated.

import type { PropsConfig } from "@jsx-contracts/helpers";

import { formatList } from "./format.js";
import type { ImportMatcher } from "./import-matcher.js";
import { createImportMatcher } from "./import-matcher.js";
import type { PropFact, Ref, Violation } from "./model.js";

/** Message ids reported by `@jsx-contracts/props`. */
export type PropsMessageId =
  | "requiredProp"
  | "requiredAnyProp"
  | "exclusiveProps"
  | "deprecatedProp"
  | "deprecatedComponent";

type PropsViolation = Violation<PropsMessageId>;

export interface PreparedProps {
  component: string;
  // The component's own import gate. Consumed by the adapter to decide whether a
  // rendered <component> is in scope; the evaluator does not read it.
  matcher: ImportMatcher;
  required: (string | string[])[];
  exclusive: [string[], string[]][];
  deprecated: [string, string | true][];
  deprecatedComponent?: string | true;
}

export function prepareProps(config: PropsConfig): PreparedProps {
  const prepared: PreparedProps = {
    component: config.component,
    matcher: createImportMatcher(config.importPath),
    required: config.required ?? [],
    exclusive: config.exclusive ?? [],
    deprecated: Object.entries(config.deprecated ?? {}),
  };

  if (config.deprecatedComponent !== undefined) {
    prepared.deprecatedComponent = config.deprecatedComponent;
  }

  return prepared;
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
  prepared: PreparedProps,
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
