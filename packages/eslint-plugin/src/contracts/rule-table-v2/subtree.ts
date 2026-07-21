/**
 * The subtree facet on v2 rows: required descendants within count bounds, plus
 * subtree bans — elements and prop-carrying elements forbidden anywhere below.
 * Branch-aware for the bans (ADR 0003 US20): a branch's `forbidDescendants` and
 * `forbidDescendantProps` apply only while its condition holds, and a violation
 * one drives carries the branch witness and `because`. Required descendants are
 * a base-level statement — no branch adds them.
 *
 * Pure over the row and an activeness predicate: which branches hold is the
 * rule's call, so this module reads only the subtree it is handed.
 */

import { countWord } from "../message-text.js";
import type { CountBounds } from "../rendered-tree/count-bounds.js";
import {
  checkCountBounds,
  resolveBounds,
} from "../rendered-tree/count-bounds.js";
import type {
  Branch,
  Ref,
  SubtreeElement,
  SubtreeNode,
} from "../rendered-tree/rendered-tree.js";
import type { Violation } from "../violation.js";

import { renderCondition } from "./condition-prose.js";
import type { SubtreeRowV2 } from "./rows-v2.js";
import { displayName } from "./rows-v2.js";

/** The messages the v2 subtree facet reports. */
export type SubtreeV2MessageId =
  | "forbiddenDescendant"
  | "forbiddenPropDescendant"
  | "tooFewDescendants"
  | "tooManyDescendants";

type SubtreeViolation = Violation<SubtreeV2MessageId>;

/** A forbidden element or prop, carrying the branch context that gated it. */
interface PreparedBan {
  name: string;
  witness: string | undefined;
  because: string | undefined;
}

/** A required descendant: its display name and resolved bounds. */
interface PreparedRequire {
  name: string;
  bounds: CountBounds;
}

/** One subtree row, prepared: base bans, per-branch bans, and requirements. */
export interface PreparedSubtree {
  component: string;
  /** Descendants required somewhere below; base-level, never branch-added. */
  require: PreparedRequire[];
  /** Bans that always apply. */
  baseForbid: PreparedBan[];
  baseForbidProps: PreparedBan[];
  /** Per-branch bans, aligned with the row's branches for the activeness call. */
  branchForbid: PreparedBan[][];
  branchForbidProps: PreparedBan[][];
}

function bansOf(
  names: string[],
  witness: string | undefined,
  because: string | undefined,
): PreparedBan[] {
  return names.map((name) => ({ name, witness, because }));
}

/** Prepare a subtree row, rendering each branch's witness once. */
export function prepareSubtree(row: SubtreeRowV2): PreparedSubtree {
  const component = displayName(row.match);

  const require: PreparedRequire[] = row.descendants.map((descendant) => ({
    name: displayName(descendant.match),
    bounds: resolveBounds(descendant.count?.min, descendant.count?.max),
  }));

  const branches = row.branches ?? [];

  return {
    component,
    require,
    baseForbid: bansOf(
      row.forbidDescendants.map((entry) => displayName(entry.match)),
      undefined,
      undefined,
    ),
    baseForbidProps: bansOf(row.forbidDescendantProps, undefined, undefined),
    branchForbid: branches.map((branch) =>
      bansOf(
        (branch.forbidDescendants ?? []).map((entry) =>
          displayName(entry.match),
        ),
        renderCondition(branch.when, component),
        branch.because,
      ),
    ),
    branchForbidProps: branches.map((branch) =>
      bansOf(
        branch.forbidDescendantProps ?? [],
        renderCondition(branch.when, component),
        branch.because,
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

/**
 * The subtree verdict for one element. `isActive` decides each branch by index;
 * base bans always apply, and an active branch's bans apply alongside them, each
 * reported with its own witness. Required-descendant counts run over the whole
 * subtree; a count stands down where unresolvable content could supply the rest.
 */
export function evaluateSubtree(
  prepared: PreparedSubtree,
  isActive: (branchIndex: number) => boolean,
  root: SubtreeElement,
): SubtreeViolation[] {
  const violations: SubtreeViolation[] = [];

  // The active ban set: base plus every active branch. First match wins, so a
  // base ban's blank witness takes precedence over a branch's on the same name.
  const forbid = new Map<string, PreparedBan>();
  const forbidProps = new Map<string, PreparedBan>();

  const collect = (
    target: Map<string, PreparedBan>,
    bans: PreparedBan[],
  ): void => {
    for (const ban of bans) {
      if (!target.has(ban.name)) {
        target.set(ban.name, ban);
      }
    }
  };

  collect(forbid, prepared.baseForbid);
  collect(forbidProps, prepared.baseForbidProps);

  prepared.branchForbid.forEach((bans, index) => {
    if (isActive(index)) {
      collect(forbid, bans);
    }
  });

  prepared.branchForbidProps.forEach((bans, index) => {
    if (isActive(index)) {
      collect(forbidProps, bans);
    }
  });

  // Inits whose forbid violations have already been reported.
  const visitedInits = new Set<number>();

  // Inits currently being resolved; re-entering one would not terminate.
  const inFlight = new Set<number>();

  const buckets = prepared.require.map((entry) => ({
    entry,
    found: [] as { ref: Ref; branches: Branch[] }[],
  }));

  let sawUnknown = false;

  function matchesForbid(name: string): PreparedBan | undefined {
    return name === "" ? undefined : forbid.get(name);
  }

  function matchesForbidProps(
    props: SubtreeElement["props"],
  ): PreparedBan | undefined {
    for (const prop of props) {
      const ban = forbidProps.get(prop.name);

      if (ban !== undefined && prop.present) {
        return ban;
      }
    }

    return undefined;
  }

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
    const banned = matchesForbid(node.name);

    if (banned !== undefined) {
      if (reportForbid) {
        violations.push({
          ref: node.ref,
          messageId: "forbiddenDescendant",
          data: {
            name: node.name,
            component: prepared.component,
            when: whenClause(banned.witness),
            because: trailing(banned.because),
          },
        });
      }

      return;
    }

    const bannedProp = matchesForbidProps(node.props);

    if (bannedProp !== undefined) {
      if (reportForbid) {
        violations.push({
          ref: node.ref,
          messageId: "forbiddenPropDescendant",
          data: {
            prop: bannedProp.name,
            component: prepared.component,
            when: whenClause(bannedProp.witness),
            because: trailing(bannedProp.because),
          },
        });
      }

      return;
    }

    // Counted at every reference site, not deduped by init.
    for (const bucket of buckets) {
      if (node.name !== "" && node.name === bucket.entry.name) {
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
    const { tooMany, tooFew } = checkCountBounds(found, entry.bounds, {
      hasUnresolvableContent: sawUnknown,
    });

    for (const occurrence of tooMany) {
      violations.push({
        ref: occurrence.ref,
        messageId: "tooManyDescendants",
        data: {
          component: prepared.component,
          name: entry.name,
          maxCount: countWord(entry.bounds.maxCount),
        },
      });
    }

    if (tooFew) {
      violations.push({
        ref: root.ref,
        messageId: "tooFewDescendants",
        data: {
          component: prepared.component,
          name: entry.name,
          minCount: countWord(entry.bounds.minCount),
        },
      });
    }
  });

  return violations;
}
