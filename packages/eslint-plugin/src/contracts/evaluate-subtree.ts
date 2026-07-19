// Pure evaluation of a subtree row: activate on the root's props (or always,
// when the row is when-less), then walk. Forbid matches report the first per
// path and stop descent there; descendant-count bounds tally every matching
// occurrence, branch-aware, across the whole subtree.

import type { NoDescendantsConfig } from "@jsx-contracts/helpers";

import {
  allPairwiseCoexist,
  minimumGuaranteedCount,
  subsetsOfSize,
} from "./evaluate-slots.js";
import { formatList } from "./format.js";
import type { ImportMatcher } from "./import-matcher.js";
import { createImportMatcher, matchesGate } from "./import-matcher.js";
import type { Branch, PropFact, Ref, Violation } from "./model.js";
import type { NormalizedWhen } from "./validate.js";
import { normalizeForbid, normalizeWhen } from "./validate.js";

/** Message ids reported by `@jsx-contracts/subtree`. */
export type SubtreeMessageId =
  | "forbiddenDescendant"
  | "forbiddenPropDescendant"
  | "tooFewDescendants"
  | "tooManyDescendants";

type SubtreeViolation = Violation<SubtreeMessageId>;

// -- the subtree facet model ---------------------------------------------------

// The subtree is a lazy tree of element, reference, and unknown nodes.
// `resolve` reads the AST, so keeping it behind a callback is what lets this
// directory import nothing from eslint. `branches` are the branch tags on the
// transparent path from the parent element (or the activated root) down to this
// node, so descendant counts stay branch-aware.
export interface SubtreeElement {
  kind: "element";
  name: string;
  ref: Ref;
  branches: Branch[];
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
  branches: Branch[];
  resolve: () => SubtreeNode[];
}

// Statically unresolvable content (a call, a param, a spread): it may render
// anything, so its mere presence makes a `min` claim unprovable.
interface SubtreeUnknown {
  kind: "unknown";
}

export type SubtreeNode = SubtreeElement | SubtreeRef | SubtreeUnknown;

interface PreparedForbid {
  name: string;
  matcher?: ImportMatcher;
}

interface PreparedRequire {
  name: string;
  minCount: number;
  maxCount: number;
  matcher?: ImportMatcher;
}

export interface PreparedSubtree {
  component: string;
  // The component's own import gate. Consumed by the adapter to decide whether
  // a rendered <component> is in scope; the evaluator does not read it.
  matcher: ImportMatcher;
  // Absent when the row is when-less: always active for the matched component.
  when: NormalizedWhen | undefined;
  forbid: PreparedForbid[];
  forbidProps: Set<string>;
  require: PreparedRequire[];
}

// A found descendant that counts toward a `require` bound, with the branch tags
// that decide whether it coexists with the others.
interface Occurrence {
  ref: Ref;
  branches: Branch[];
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

  // Count-bound defaults mirror the slots facet exactly: neither bound means at
  // most one; only min lifts the upper bound; only max keeps a lower bound of
  // zero.
  const require: PreparedRequire[] = (config.require ?? []).map((entry) => {
    const prepared: PreparedRequire = {
      name: entry.name,
      minCount: entry.min ?? 0,
      maxCount: entry.max ?? (entry.min !== undefined ? Infinity : 1),
    };

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
    require,
  };
}

// A when-less row carries no condition text; a conditional one carries its own
// leading space, so the message templates read cleanly either way.
function conditionText(when: NormalizedWhen | undefined): string {
  if (when === undefined) {
    return "";
  }

  if (when.values === undefined) {
    return ` with a \`${when.prop}\` prop`;
  }

  const quoted = when.values.map((value) => JSON.stringify(value));

  if (quoted.length === 1) {
    return ` with \`${when.prop}\` set to ${quoted[0]}`;
  }

  return ` with \`${when.prop}\` set to one of ${formatList(quoted)}`;
}

function countWord(count: number): string {
  return count === 1 ? "one" : String(count);
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

function isActive(
  props: PropFact[],
  when: NormalizedWhen | undefined,
): boolean {
  if (when === undefined) {
    return true;
  }

  const prop = props.find((fact) => fact.name === when.prop);

  if (prop === undefined) {
    return false;
  }

  return when.values === undefined
    ? prop.present
    : propMatchesValues(prop, when.values);
}

// Whether the row applies to a component with these props. Lets the adapter
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

function matchesRequire(node: SubtreeElement, entry: PreparedRequire): boolean {
  return (
    node.name !== "" &&
    node.name === entry.name &&
    (entry.matcher === undefined ||
      matchesGate(entry.matcher, node.importSource))
  );
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

  // Gates the forbid side only. A ref's init joins the set the first time the
  // walk reaches and resolves it, so a ref blocked behind a forbidden element
  // never claims its init and a later sibling reference is still free to
  // report. Once an init is here, every later reference to the same constant
  // re-walks with forbid reporting suppressed, so a single source element is
  // reported once per ref chain. Never cleared.
  const visitedInits = new Set<number>();

  // Gates the require side's recursion only. Require counting must tally an
  // occurrence at every reference site, so an already-visited init is re-walked
  // rather than skipped. That re-walk would not terminate for a self- or
  // mutually-recursive constant, so an init is added on entry to its resolution
  // and removed on exit; reaching an in-flight init stops. This counts a
  // self-referential constant's occurrences once per outer reference site,
  // which is the desired behavior.
  const inFlight = new Set<number>();

  // One occurrence bucket per require entry, filled during the walk.
  const buckets = prepared.require.map((entry) => ({
    entry,
    found: [] as Occurrence[],
  }));

  // A statically unresolvable node anywhere in the activated subtree makes a
  // `min` claim unprovable (the missing element may be produced dynamically);
  // `max` is still checked on what is visible.
  let sawUnknown = false;

  // `report` is false while re-walking an already-visited init: the walk still
  // descends (so require counting sees this reference site) and still prunes
  // below forbidden elements, but suppresses the forbid/forbidProps reports the
  // first walk of that init already emitted.
  function visit(
    node: SubtreeNode,
    inherited: Branch[],
    report: boolean,
  ): void {
    if (node.kind === "unknown") {
      sawUnknown = true;

      return;
    }

    if (node.kind === "ref") {
      // The first reference to reach this init reports its forbid violations;
      // every later reference re-walks it for require counting with reporting
      // suppressed.
      const firstVisit = !visitedInits.has(node.initId);

      visitedInits.add(node.initId);

      // With nothing to count, a re-walk has no effect — skip it so a
      // forbid-only contract keeps the walk linear in distinct constants.
      if (!firstVisit && prepared.require.length === 0) {
        return;
      }

      // Terminate self- or mutually-recursive constants: an init already being
      // resolved higher on the stack is not re-entered.
      if (inFlight.has(node.initId)) {
        return;
      }

      inFlight.add(node.initId);

      const branches = [...inherited, ...node.branches];

      for (const produced of node.resolve()) {
        visit(produced, branches, report && firstVisit);
      }

      inFlight.delete(node.initId);

      return;
    }

    const branches = [...inherited, ...node.branches];

    // A forbidden element prunes the walk below it on every pass; only the
    // first (reporting) pass records the violation.
    if (matchesForbid(node, prepared)) {
      if (report) {
        violations.push({
          ref: node.ref,
          messageId: "forbiddenDescendant",
          data: { name: node.name, component: prepared.component, condition },
        });
      }

      return;
    }

    const prop = matchesForbidProps(node, prepared);

    if (prop !== undefined) {
      if (report) {
        violations.push({
          ref: node.ref,
          messageId: "forbiddenPropDescendant",
          data: { prop, component: prepared.component, condition },
        });
      }

      return;
    }

    // Require counting is independent of `report`: every reference site counts,
    // so a shared JSX constant referenced from several places is tallied once
    // per site rather than deduped by init.
    for (const bucket of buckets) {
      if (matchesRequire(node, bucket.entry)) {
        bucket.found.push({ ref: node.ref, branches });
      }
    }

    // Attribute-value JSX is walked before body children.
    for (const child of node.propChildren) {
      visit(child, branches, report);
    }

    for (const child of node.children) {
      visit(child, branches, report);
    }
  }

  // The row applies below the activated element, not to it.
  for (const child of root.propChildren) {
    visit(child, [], true);
  }

  for (const child of root.children) {
    visit(child, [], true);
  }

  // A callback, not a `for…of`: `sawUnknown` is only ever set inside `visit`,
  // which control-flow analysis does not follow through to the loop body.
  buckets.forEach(({ entry, found }) => {
    // Exceeds max N when some N coexisting earlier occurrences can all render
    // alongside this one (opposite ternary branches never do).
    if (entry.maxCount !== Infinity) {
      for (const [position, occurrence] of found.entries()) {
        const earlier = found.slice(0, position);

        const exceeds = subsetsOfSize(earlier, entry.maxCount).some((subset) =>
          allPairwiseCoexist([...subset, occurrence]),
        );

        if (exceeds) {
          violations.push({
            ref: occurrence.ref,
            messageId: "tooManyDescendants",
            data: {
              component: prepared.component,
              condition,
              name: entry.name,
              max: countWord(entry.maxCount),
            },
          });
        }
      }
    }

    // min is a presence claim on every render path, so unknown content skips it.
    if (
      entry.minCount > 0 &&
      !sawUnknown &&
      minimumGuaranteedCount(found) < entry.minCount
    ) {
      violations.push({
        ref: root.ref,
        messageId: "tooFewDescendants",
        data: {
          component: prepared.component,
          condition,
          name: entry.name,
          min: countWord(entry.minCount),
        },
      });
    }
  });

  return violations;
}
