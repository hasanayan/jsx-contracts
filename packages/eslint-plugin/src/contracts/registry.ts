import type { ConditionPool } from "./condition.js";
import { createConditionPool } from "./condition.js";
import type {
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
import type { CombinedSlots, PreparedSlotsRow } from "./evaluate-slots.js";
import {
  buildPlacementIndex,
  combineSlots,
  evaluateSlots,
  prepareSlotsRow,
} from "./evaluate-slots.js";
import type {
  CombinedSubtree,
  PreparedSubtreeRow,
} from "./evaluate-subtree.js";
import {
  combineSubtree,
  evaluateSubtree,
  prepareSubtreeRow,
} from "./evaluate-subtree.js";
import type { ElementFacts } from "./facts.js";
import type { ImportMatcher } from "./import-matcher.js";
import { createImportMatcher, matchesGate } from "./import-matcher.js";
import type { Violation } from "./model.js";
import type { ContractRow, ContractRows, Facet } from "./payload.js";

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
  /**
   * A facet-specific supplementary index, built over the facet's own rows and
   * merged into the generic per-component one. The slots facet uses it for the
   * placement pass — the `misplaced` check keys off the slot element, not the
   * container, so it cannot go through the per-component grouping. The other
   * three facets omit it, and the code above the seam stays generic over rows.
   */
  index?: (rows: Row[]) => FacetIndex;
}

function buildIndex<Row extends ContractRow, Prepared, Combined>(
  facet: Facet,
  rows: ContractRows,
  pool: ConditionPool,
  spec: FacetSpec<Row, Prepared, Combined>,
): FacetIndex {
  const groups = new Map<string, Group<Prepared, Combined>>();
  const facetRows: Row[] = [];

  for (const row of rows) {
    if (row.facet !== facet) {
      continue;
    }

    facetRows.push(row as Row);

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

  const base: FacetIndex = {
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
          (entry.condition === undefined ||
            pool.holdsAt(element, entry.condition));

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

  const extra = spec.index?.(facetRows);

  if (extra === undefined) {
    return base;
  }

  // The supplementary index runs beside the per-component one; its names widen
  // the skip set and its violations follow the per-component ones.
  return {
    names: new Set([...base.names, ...extra.names]),
    analyze: (element): Violation<string>[] => [
      ...base.analyze(element),
      ...extra.analyze(element),
    ],
  };
}

type SlotsRowType = Extract<ContractRow, { facet: "slots" }>;
type SubtreeRowType = Extract<ContractRow, { facet: "subtree" }>;
type PropsRowType = Extract<ContractRow, { facet: "props" }>;
type AncestorRowType = Extract<ContractRow, { facet: "ancestor" }>;

/** A rule table, prepared once: matchers compiled, slot maps built, conditions interned. */
export interface PreparedTable {
  facets: Record<Facet, FacetIndex>;
}

// One table, one pool: condition ids are indices into the pool that interned
// them, so a pool never outlives the table whose rows it was built from.
export function prepareTable(rows: ContractRows): PreparedTable {
  const pool = createConditionPool();

  return {
    facets: {
      slots: buildIndex<SlotsRowType, PreparedSlotsRow, CombinedSlots>(
        "slots",
        rows,
        pool,
        {
          prepare: prepareSlotsRow,
          combine: combineSlots,
          evaluate: (combined, element) =>
            evaluateSlots(combined, element.slotsRoot(), element.openingRef),
          index: buildPlacementIndex,
        },
      ),
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
