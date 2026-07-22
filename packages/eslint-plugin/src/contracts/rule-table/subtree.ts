/**
 * Required descendants within count bounds, plus subtree bans. Only the bans are
 * branch-aware (ADR 0003 US20); required descendants are base-level. Pure over
 * the row and an activeness predicate — which branches hold is the rule's call.
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
import { matchesElement } from "./match.js";
import type { Forbidden, MatchKey, SubtreeRow } from "./rows.js";
import { displayName } from "./rows.js";

export type SubtreeMessageId =
  | "forbiddenDescendant"
  | "forbiddenPropDescendant"
  | "tooFewDescendants"
  | "tooManyDescendants";

type SubtreeViolation = Violation<SubtreeMessageId>;

/** `match` is absent for a prop ban, where `name` is a prop and gates nothing. */
interface PreparedBan {
  name: string;
  match?: MatchKey;
  witness: string | undefined;
  because: string | undefined;
}

interface PreparedRequire {
  name: string;
  match: MatchKey;
  bounds: CountBounds;
}

export interface PreparedSubtree {
  component: string;
  require: PreparedRequire[];
  baseForbid: PreparedBan[];
  baseForbidProps: PreparedBan[];
  /** Aligned with the row's branches, for the activeness call by index. */
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

function elementBansOf(
  entries: Forbidden[],
  witness: string | undefined,
  because: string | undefined,
): PreparedBan[] {
  return entries.map((entry) => ({
    name: displayName(entry.match),
    match: entry.match,
    witness,
    because,
  }));
}

// Renders each branch's witness once.
export function prepareSubtree(row: SubtreeRow): PreparedSubtree {
  const component = displayName(row.match);

  const require: PreparedRequire[] = row.descendants.map((descendant) => ({
    name: displayName(descendant.match),
    match: descendant.match,
    bounds: resolveBounds(descendant.count?.min, descendant.count?.max),
  }));

  const branches = row.branches ?? [];

  return {
    component,
    require,
    baseForbid: elementBansOf(row.forbidDescendants, undefined, undefined),
    baseForbidProps: bansOf(row.forbidDescendantProps, undefined, undefined),
    branchForbid: branches.map((branch) =>
      elementBansOf(
        branch.forbidDescendants ?? [],
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
 * Base bans always apply and an active branch's apply alongside them, each with
 * its own witness. A count stands down where unresolvable content could supply
 * the rest.
 */
export function evaluateSubtree(
  prepared: PreparedSubtree,
  isActive: (branchIndex: number) => boolean,
  root: SubtreeElement,
): SubtreeViolation[] {
  const violations: SubtreeViolation[] = [];

  // Collected in order and read first-match-wins, so a base ban's blank witness
  // beats a branch's, and two bans on one name under different gates coexist.
  const forbid = new Map<string, PreparedBan[]>();
  const forbidProps = new Map<string, PreparedBan[]>();

  const collect = (
    target: Map<string, PreparedBan[]>,
    bans: PreparedBan[],
  ): void => {
    for (const ban of bans) {
      const existing = target.get(ban.name);

      if (existing === undefined) {
        target.set(ban.name, [ban]);
      } else {
        existing.push(ban);
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

  const visitedInits = new Set<number>();

  // Re-entering one of these would not terminate.
  const inFlight = new Set<number>();

  const buckets = prepared.require.map((entry) => ({
    entry,
    found: [] as { ref: Ref; branches: Branch[] }[],
  }));

  let sawUnknown = false;

  function matchesForbid(node: SubtreeElement): PreparedBan | undefined {
    if (node.name === "") {
      return undefined;
    }

    return forbid
      .get(node.name)
      ?.find(
        (ban) => ban.match !== undefined && matchesElement(ban.match, node),
      );
  }

  function matchesForbidProps(
    props: SubtreeElement["props"],
  ): PreparedBan | undefined {
    for (const prop of props) {
      const ban = forbidProps.get(prop.name)?.[0];

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
    const banned = matchesForbid(node);

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

    for (const bucket of buckets) {
      if (node.name !== "" && matchesElement(bucket.entry.match, node)) {
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

  for (const child of root.propChildren) {
    visit(child, [], true);
  }

  for (const child of root.children) {
    visit(child, [], true);
  }

  // A callback, not `for...of`, which would narrow `sawUnknown` to `false`.
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
