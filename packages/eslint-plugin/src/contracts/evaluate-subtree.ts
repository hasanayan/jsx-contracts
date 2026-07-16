// Pure evaluation of a subtree ban: activate on the root's props, then walk,
// reporting the first forbidden match per path and stopping descent there.

import { formatList } from "./format.js";
import type { ImportMatcher } from "./import-matcher.js";
import { createImportMatcher, matchesGate } from "./import-matcher.js";
import type { PropFact, Ref, Violation } from "./model.js";
import type { NoDescendantsConfig, NormalizedWhen } from "./validate.js";
import { normalizeForbid, normalizeWhen } from "./validate.js";

/** Message ids reported by `@jsx-contracts/subtree`. */
export type SubtreeMessageId =
  "forbiddenDescendant" | "forbiddenPropDescendant";

type SubtreeViolation = Violation<SubtreeMessageId>;

// -- the subtree facet model ---------------------------------------------------

// The subtree is a lazy tree of element and reference nodes. `resolve` reads
// the AST, so keeping it behind a callback is what lets this directory import
// nothing from eslint.
export interface SubtreeElement {
  kind: "element";
  name: string;
  ref: Ref;
  importSource: string | null;
  props: PropFact[];
  propChildren: SubtreeNode[];
  children: SubtreeNode[];
}

// `initId` is equal across every reference to the same constant, so the walk
// can dedup by init.
export interface SubtreeRef {
  kind: "ref";
  initId: number;
  resolve: () => SubtreeNode[];
}

export type SubtreeNode = SubtreeElement | SubtreeRef;

interface PreparedForbid {
  name: string;
  matcher?: ImportMatcher;
}

export interface PreparedSubtree {
  component: string;
  // The component's own import gate. Consumed by the adapter to decide whether
  // a rendered <component> is in scope; the evaluator does not read it.
  matcher: ImportMatcher;
  when: NormalizedWhen;
  forbid: PreparedForbid[];
  forbidProps: Set<string>;
}

export function prepareSubtree(config: NoDescendantsConfig): PreparedSubtree {
  const forbid: PreparedForbid[] = (config.forbid ?? []).map((rawEntry) => {
    const entry = normalizeForbid(rawEntry);
    const prepared: PreparedForbid = { name: entry.name };

    if (entry.importPath !== undefined) {
      prepared.matcher = createImportMatcher(entry.importPath);
    }

    return prepared;
  });

  return {
    component: config.component,
    matcher: createImportMatcher(config.importPath),
    when: normalizeWhen(config.when),
    forbid,
    forbidProps: new Set(config.forbidProps ?? []),
  };
}

function conditionText(when: NormalizedWhen): string {
  if (when.values === undefined) {
    return `with a \`${when.prop}\` prop`;
  }

  const quoted = when.values.map((value) => JSON.stringify(value));

  if (quoted.length === 1) {
    return `with \`${when.prop}\` set to ${quoted[0]}`;
  }

  return `with \`${when.prop}\` set to one of ${formatList(quoted)}`;
}

// A resolved literal matches by equality; a member expression or identifier
// matches a string candidate by its dotted source text (e.g. "Size.large").
function propMatchesValues(
  prop: PropFact,
  values: (string | number | boolean)[],
): boolean {
  if (prop.value !== undefined && values.includes(prop.value)) {
    return true;
  }

  return (
    prop.source !== undefined &&
    values.some(
      (candidate) => typeof candidate === "string" && candidate === prop.source,
    )
  );
}

function isActive(props: PropFact[], when: NormalizedWhen): boolean {
  const prop = props.find((fact) => fact.name === when.prop);

  if (prop === undefined) {
    return false;
  }

  return when.values === undefined
    ? prop.present
    : propMatchesValues(prop, when.values);
}

// Whether the ban applies to a component with these props. Lets the adapter
// skip building the subtree of an inactive component.
export function isActivated(
  prepared: PreparedSubtree,
  props: PropFact[],
): boolean {
  return isActive(props, prepared.when);
}

function matchesForbid(
  node: SubtreeElement,
  prepared: PreparedSubtree,
): boolean {
  if (node.name === "") {
    return false;
  }

  return prepared.forbid.some(
    (entry) =>
      entry.name === node.name &&
      (entry.matcher === undefined ||
        matchesGate(entry.matcher, node.importSource)),
  );
}

function matchesForbidProps(
  node: SubtreeElement,
  prepared: PreparedSubtree,
): string | undefined {
  for (const prop of node.props) {
    if (prepared.forbidProps.has(prop.name) && prop.present) {
      return prop.name;
    }
  }

  return undefined;
}

export function evaluateSubtree(
  prepared: PreparedSubtree,
  root: SubtreeElement,
): SubtreeViolation[] {
  const violations: SubtreeViolation[] = [];

  if (!isActive(root.props, prepared.when)) {
    return violations;
  }

  const condition = conditionText(prepared.when);

  // A ref's init joins the set only when the walk reaches and resolves it, so a
  // ref blocked behind a forbidden element never claims its init and a later
  // reference to the same constant is still reported. Never cleared, so it also
  // terminates self-referential constants.
  const visitedInits = new Set<number>();

  function visit(node: SubtreeNode): void {
    if (node.kind === "ref") {
      if (visitedInits.has(node.initId)) {
        return;
      }

      visitedInits.add(node.initId);

      for (const produced of node.resolve()) {
        visit(produced);
      }

      return;
    }

    if (matchesForbid(node, prepared)) {
      violations.push({
        ref: node.ref,
        messageId: "forbiddenDescendant",
        data: { name: node.name, component: prepared.component, condition },
      });

      return;
    }

    const prop = matchesForbidProps(node, prepared);

    if (prop !== undefined) {
      violations.push({
        ref: node.ref,
        messageId: "forbiddenPropDescendant",
        data: { prop, component: prepared.component, condition },
      });

      return;
    }

    // Attribute-value JSX is walked before body children.
    for (const child of node.propChildren) {
      visit(child);
    }

    for (const child of node.children) {
      visit(child);
    }
  }

  // The ban applies below the activated element, not to it.
  for (const child of root.propChildren) {
    visit(child);
  }

  for (const child of root.children) {
    visit(child);
  }

  return violations;
}
