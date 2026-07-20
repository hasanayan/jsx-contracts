import type { ConditionPool } from "./condition.js";
import { conditionHolds } from "./condition.js";
import type {
  AncestorFact,
  CombinedAncestor,
  PreparedAncestorRow,
} from "./evaluate-ancestor.js";
import {
  combineAncestor,
  evaluateAncestor,
  prepareAncestorRow,
} from "./evaluate-ancestor.js";
import type { CombinedProps, PreparedPropsRow } from "./evaluate-props.js";
import {
  combineProps,
  evaluateProps,
  preparePropsRow,
} from "./evaluate-props.js";
import type {
  CombinedSlots,
  Placement,
  PreparedSlotsRow,
} from "./evaluate-slots.js";
import {
  combineSlots,
  evaluateSlots,
  isPlacedInContainer,
  prepareSlotsRow,
} from "./evaluate-slots.js";
import type {
  CombinedSubtree,
  PreparedSubtreeRow,
  SubtreeElement,
} from "./evaluate-subtree.js";
import {
  combineSubtree,
  evaluateSubtree,
  prepareSubtreeRow,
} from "./evaluate-subtree.js";
import type { ImportMatcher } from "./import-matcher.js";
import { createImportMatcher, matchesGate } from "./import-matcher.js";
import type { PropFact, Ref, RenderedNode, Violation } from "./model.js";
import type { ContractRow, ContractRows, Facet } from "./payload.js";
import { normalizeSlot } from "./validate.js";

/**
 * One element, as the adapter presents it. Every accessor beyond `name` and
 * `importSource` is a thunk the adapter memoizes: the pipeline calls only the
 * ones the active rows actually need.
 */
export interface ElementFacts {
  name: string;
  importSource: string | null;
  /** The whole element — where a container's `tooFew` and a misplaced slot report. */
  elementRef: Ref;
  /** The opening element — where prop- and element-level violations report. */
  openingRef: Ref;
  props: () => PropFact[];
  hasSpread: () => boolean;
  slotsRoot: () => RenderedNode;
  placement: () => Placement;
  subtreeRoot: () => SubtreeElement;
  ancestors: () => AncestorFact[];
  /** Whether the interned condition holds here. Memoized per element. */
  holds: (conditionId: number) => boolean;
}

interface FacetIndex {
  /**
   * Every tag this facet could report on. A name outside it can match nothing,
   * so the rule skips the element before the expensive scope walk.
   */
  names: Set<string>;
  analyze: (element: ElementFacts) => Violation<string>[];
}

interface PreparedEntry<Prepared> {
  prepared: Prepared;
  matcher: ImportMatcher;
  /** Undefined when the row is when-less, and so always active. */
  condition: number | undefined;
}

interface Group<Prepared, Combined> {
  component: string;
  entries: PreparedEntry<Prepared>[];
  // Keyed by activation mask, and shared across elements: combined values must
  // not be mutated.
  cache: Map<string, Combined>;
}

interface FacetSpec<Row extends ContractRow, Prepared, Combined> {
  prepare: (row: Row) => Prepared;
  combine: (component: string, rows: Prepared[]) => Combined;
  evaluate: (combined: Combined, element: ElementFacts) => Violation<string>[];
}

function buildIndex<Row extends ContractRow, Prepared, Combined>(
  facet: Facet,
  rows: ContractRows,
  pool: ConditionPool,
  spec: FacetSpec<Row, Prepared, Combined>,
): FacetIndex {
  const groups = new Map<string, Group<Prepared, Combined>>();

  for (const row of rows) {
    if (row.facet !== facet) {
      continue;
    }

    // Grouped by component name alone; the gate is part of activation.
    let group = groups.get(row.component);

    if (group === undefined) {
      group = { component: row.component, entries: [], cache: new Map() };
      groups.set(row.component, group);
    }

    group.entries.push({
      prepared: spec.prepare(row as Row),
      matcher: createImportMatcher(row.importPath),
      condition: pool.intern(row.when),
    });
  }

  return {
    names: new Set(groups.keys()),
    analyze(element): Violation<string>[] {
      const group = groups.get(element.name);

      if (group === undefined) {
        return [];
      }

      // Activation is gate ∧ condition; the mask keys the combine cache.
      let mask = "";
      const active: Prepared[] = [];

      for (const entry of group.entries) {
        const on =
          matchesGate(entry.matcher, element.importSource) &&
          (entry.condition === undefined || element.holds(entry.condition));

        mask += on ? "1" : "0";

        if (on) {
          active.push(entry.prepared);
        }
      }

      if (active.length === 0) {
        return [];
      }

      let combined = group.cache.get(mask);

      if (combined === undefined) {
        combined = spec.combine(group.component, active);
        group.cache.set(mask, combined);
      }

      return spec.evaluate(combined, element);
    },
  };
}

// Where a slot may be placed. Checked on the slot itself, so conditional rows
// count too: the container element is not in hand.
interface SlotPlacement {
  container: string;
  containerMatcher: ImportMatcher;
  slotMatcher: ImportMatcher;
}

function buildSlotsIndex(rows: ContractRows, pool: ConditionPool): FacetIndex {
  const containers = buildIndex<SlotsRowType, PreparedSlotsRow, CombinedSlots>(
    "slots",
    rows,
    pool,
    {
      prepare: prepareSlotsRow,
      combine: combineSlots,
      evaluate: (combined, element) =>
        evaluateSlots(combined, element.slotsRoot(), element.openingRef),
    },
  );

  const placements = new Map<string, SlotPlacement[]>();

  for (const row of rows) {
    if (row.facet !== "slots") {
      continue;
    }

    const containerMatcher = createImportMatcher(row.importPath);

    for (const rawSlot of row.slots ?? []) {
      const slot = normalizeSlot(rawSlot);
      const entries = placements.get(slot.name) ?? [];

      entries.push({
        container: row.component,
        containerMatcher,
        slotMatcher:
          slot.importPath === undefined
            ? containerMatcher
            : createImportMatcher(slot.importPath),
      });

      placements.set(slot.name, entries);
    }
  }

  return {
    names: new Set([...containers.names, ...placements.keys()]),
    analyze(element): Violation<string>[] {
      const violations = containers.analyze(element);
      const declared = placements.get(element.name);

      if (declared === undefined) {
        return violations;
      }

      // One `misplaced` per declaring container, deduped.
      const reported = new Set<string>();

      for (const entry of declared) {
        if (
          reported.has(entry.container) ||
          !matchesGate(entry.slotMatcher, element.importSource) ||
          isPlacedInContainer(
            element.placement(),
            entry.container,
            entry.containerMatcher,
          )
        ) {
          continue;
        }

        reported.add(entry.container);
        violations.push({
          ref: element.elementRef,
          messageId: "misplaced",
          data: { container: entry.container, name: element.name },
        });
      }

      return violations;
    },
  };
}

type SlotsRowType = Extract<ContractRow, { facet: "slots" }>;
type SubtreeRowType = Extract<ContractRow, { facet: "subtree" }>;
type PropsRowType = Extract<ContractRow, { facet: "props" }>;
type AncestorRowType = Extract<ContractRow, { facet: "ancestor" }>;

/** A rule table, prepared once: matchers compiled, slot maps built, conditions interned. */
export interface PreparedTable {
  facets: Record<Facet, FacetIndex>;
  pool: ConditionPool;
}

export function prepareTable(
  rows: ContractRows,
  pool: ConditionPool,
): PreparedTable {
  return {
    pool,
    facets: {
      slots: buildSlotsIndex(rows, pool),
      subtree: buildIndex<SubtreeRowType, PreparedSubtreeRow, CombinedSubtree>(
        "subtree",
        rows,
        pool,
        {
          prepare: prepareSubtreeRow,
          combine: combineSubtree,
          evaluate: (combined, element) =>
            evaluateSubtree(combined, element.subtreeRoot()),
        },
      ),
      props: buildIndex<PropsRowType, PreparedPropsRow, CombinedProps>(
        "props",
        rows,
        pool,
        {
          prepare: preparePropsRow,
          combine: combineProps,
          evaluate: (combined, element) =>
            evaluateProps(
              combined,
              element.props(),
              element.hasSpread(),
              element.openingRef,
            ),
        },
      ),
      ancestor: buildIndex<
        AncestorRowType,
        PreparedAncestorRow,
        CombinedAncestor
      >("ancestor", rows, pool, {
        prepare: prepareAncestorRow,
        combine: combineAncestor,
        evaluate: (combined, element) =>
          evaluateAncestor(combined, element.ancestors(), element.openingRef),
      }),
    },
  };
}

/**
 * Evaluate one interned condition against an element's props. `hasSpread` is
 * what deactivates a tree containing a negation — see `conditionHolds`.
 */
export function holdsAt(
  pool: ConditionPool,
  conditionId: number,
  props: PropFact[],
  hasSpread: boolean,
): boolean {
  const condition = pool.conditions[conditionId];

  return condition !== undefined && conditionHolds(condition, props, hasSpread);
}
