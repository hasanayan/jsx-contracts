import {
  allPairwiseCoexist,
  minimumGuaranteedCount,
  subsetsOfSize,
} from "./evaluate-slots.js";
import type { ImportMatcher } from "./import-matcher.js";
import { createImportMatcher, matchesGate } from "./import-matcher.js";
import type { Branch, PropFact, Ref, Violation } from "./model.js";
import type { SubtreeRow } from "./payload.js";
import { normalizeForbid } from "./validate.js";

/** Message ids reported by `@jsx-contracts/subtree`. */
export type SubtreeMessageId =
  | "forbiddenDescendant"
  | "forbiddenPropDescendant"
  | "tooFewDescendants"
  | "tooManyDescendants";

type SubtreeViolation = Violation<SubtreeMessageId>;

/**
 * One element in the lazy subtree. `branches` are the branch tags on the
 * transparent path from the parent element down to this node, which is what
 * keeps descendant counts branch-aware.
 */
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

/**
 * A reference to a JSX constant, resolved lazily. `initId` is equal across
 * every reference to the same constant.
 */
export interface SubtreeRef {
  kind: "ref";
  initId: number;
  branches: Branch[];
  resolve: () => SubtreeNode[];
}

// Statically unresolvable content: a call, a param, a spread.
interface SubtreeUnknown {
  kind: "unknown";
}

export type SubtreeNode = SubtreeElement | SubtreeRef | SubtreeUnknown;

interface PreparedForbid {
  name: string;
  importPath?: string;
  matcher?: ImportMatcher;
}

interface PreparedRequire {
  name: string;
  minCount: number;
  maxCount: number;
  importPath?: string;
  matcher?: ImportMatcher;
}

/** One subtree row, prepared. Combined with the other active rows before use. */
export interface PreparedSubtreeRow {
  forbid: PreparedForbid[];
  forbidProps: string[];
  require: PreparedRequire[];
}

/** The effective subtree contract for one element: the combination of its active rows. */
export interface CombinedSubtree {
  component: string;
  forbid: PreparedForbid[];
  forbidProps: Set<string>;
  require: PreparedRequire[];
}

interface Occurrence {
  ref: Ref;
  branches: Branch[];
}

function gateKey(entry: { name: string; importPath?: string }): string {
  return `${entry.name}\n${entry.importPath ?? ""}`;
}

export function prepareSubtreeRow(row: SubtreeRow): PreparedSubtreeRow {
  const forbid: PreparedForbid[] = (row.forbid ?? []).map((rawEntry) => {
    const entry = normalizeForbid(rawEntry);
    const prepared: PreparedForbid = { name: entry.name };

    if (entry.importPath !== undefined) {
      prepared.importPath = entry.importPath;
      prepared.matcher = createImportMatcher(entry.importPath);
    }

    return prepared;
  });

  const require: PreparedRequire[] = (row.require ?? []).map((entry) => {
    const prepared: PreparedRequire = {
      name: entry.name,
      minCount: entry.min ?? 0,
      maxCount: entry.max ?? (entry.min !== undefined ? Infinity : 1),
    };

    if (entry.importPath !== undefined) {
      prepared.importPath = entry.importPath;
      prepared.matcher = createImportMatcher(entry.importPath);
    }

    return prepared;
  });

  return { forbid, forbidProps: row.forbidProps ?? [], require };
}

/**
 * Combine the rows active on one element into one effective contract.
 *
 * Every key unions: a subtree row states prohibitions and requirements, and two
 * rows stating them both apply. Entries naming the same element under the same
 * gate are one statement, not two — a repeated `forbid` would otherwise report
 * twice, and a repeated `require` would tally its occurrences into two buckets.
 * Repeated bounds tighten, clamped so they cannot cross into unsatisfiable.
 */
export function combineSubtree(
  component: string,
  rows: PreparedSubtreeRow[],
): CombinedSubtree {
  const forbid = new Map<string, PreparedForbid>();
  const forbidProps = new Set<string>();
  const require = new Map<string, PreparedRequire>();

  for (const row of rows) {
    for (const entry of row.forbid) {
      const key = gateKey(entry);

      if (!forbid.has(key)) {
        forbid.set(key, entry);
      }
    }

    for (const prop of row.forbidProps) {
      forbidProps.add(prop);
    }

    for (const entry of row.require) {
      const key = gateKey(entry);
      const existing = require.get(key);

      if (existing === undefined) {
        require.set(key, entry);

        continue;
      }

      const maxCount = Math.min(existing.maxCount, entry.maxCount);

      require.set(key, {
        ...existing,
        minCount: Math.min(
          Math.max(existing.minCount, entry.minCount),
          maxCount,
        ),
        maxCount,
      });
    }
  }

  return {
    component,
    forbid: [...forbid.values()],
    forbidProps,
    require: [...require.values()],
  };
}

function countWord(count: number): string {
  return count === 1 ? "one" : String(count);
}

function matchesForbid(
  node: SubtreeElement,
  prepared: CombinedSubtree,
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
  prepared: CombinedSubtree,
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
  prepared: CombinedSubtree,
  root: SubtreeElement,
): SubtreeViolation[] {
  const violations: SubtreeViolation[] = [];

  // Inits whose forbid violations have already been reported.
  const visitedInits = new Set<number>();

  // Inits currently being resolved; re-entering one would not terminate.
  const inFlight = new Set<number>();

  const buckets = prepared.require.map((entry) => ({
    entry,
    found: [] as Occurrence[],
  }));

  let sawUnknown = false;

  function visit(
    node: SubtreeNode,
    inherited: Branch[],
    reportForbid: boolean,
  ): void {
    if (node.kind === "unknown") {
      sawUnknown = true;

      return;
    }

    if (node.kind === "ref") {
      const firstVisit = !visitedInits.has(node.initId);

      visitedInits.add(node.initId);

      // Nothing to count, so a re-walk has no effect.
      if (!firstVisit && prepared.require.length === 0) {
        return;
      }

      if (inFlight.has(node.initId)) {
        return;
      }

      inFlight.add(node.initId);

      const branches = [...inherited, ...node.branches];

      for (const produced of node.resolve()) {
        visit(produced, branches, reportForbid && firstVisit);
      }

      inFlight.delete(node.initId);

      return;
    }

    const branches = [...inherited, ...node.branches];

    // A forbidden element prunes the walk below it on every pass.
    if (matchesForbid(node, prepared)) {
      if (reportForbid) {
        violations.push({
          ref: node.ref,
          messageId: "forbiddenDescendant",
          data: { name: node.name, component: prepared.component },
        });
      }

      return;
    }

    const prop = matchesForbidProps(node, prepared);

    if (prop !== undefined) {
      if (reportForbid) {
        violations.push({
          ref: node.ref,
          messageId: "forbiddenPropDescendant",
          data: { prop, component: prepared.component },
        });
      }

      return;
    }

    // Counted at every reference site, not deduped by init.
    for (const bucket of buckets) {
      if (matchesRequire(node, bucket.entry)) {
        bucket.found.push({ ref: node.ref, branches });
      }
    }

    for (const child of node.propChildren) {
      visit(child, branches, reportForbid);
    }

    for (const child of node.children) {
      visit(child, branches, reportForbid);
    }
  }

  // The row applies below the activated element, not to it.
  for (const child of root.propChildren) {
    visit(child, [], true);
  }

  for (const child of root.children) {
    visit(child, [], true);
  }

  // A callback, not `for...of`: a loop body narrows `sawUnknown` to `false`.
  buckets.forEach(({ entry, found }) => {
    // Exceeds max N when N earlier occurrences can all render alongside this one.
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
          name: entry.name,
          min: countWord(entry.minCount),
        },
      });
    }
  });

  return violations;
}
