// The unsatisfiability check: a build-time pass over a compiled contract that
// reports where a component's rows combine into something no file could
// satisfy. Authoring-side by necessity — the plugin holds the condition trees
// as opaque payload and cannot tell a reachable combination of conditions from
// an unreachable one, so it keeps its combination total and silent (ADR 0001).
//
// Scope is the narrowing the combination performs, because that is the only
// place a contract can quietly weaken itself: the children facet, where a
// conditional slot list intersects with the base one. The other facets union,
// and a union cancels nothing.

import type {
  ContractRows,
  SlotConfig,
  SlotsRow,
  WhenCondition,
} from "@jsx-contracts/eslint-plugin";

import type { Exclusivity, NormalizedCondition } from "./exclusivity.js";
import { createExclusivity, normalizeCondition } from "./exclusivity.js";
import type { CompiledContracts } from "./rule-table.js";

/** Which narrowing cancelled a rule. */
export type NarrowingKind =
  /** A slot one row requires, intersected away by another. */
  | "excludedSlot"
  /** An `.atLeast(n)` clamped down by another row's smaller `.atMost(n)`. */
  | "crossedBounds"
  /** A cross-slot reference dropped because its target did not survive. */
  | "droppedReference";

/** One of the two rows a narrowing names. */
export interface ConflictingRow {
  /** The row's position in the rule table, as `contracts.rows[index]`. */
  index: number;
  /** The row's when-condition, as authored. Absent on an unconditional row. */
  when?: WhenCondition;
}

/** One rule a component's rows cancel between them. */
export interface Narrowing {
  /**
   * Stable identity of this narrowing: kind, component and slot. Pass it to
   * `allow` to accept a deliberate one.
   */
  id: string;
  kind: NarrowingKind;
  component: string;
  /** Always the children facet — the only one whose combination narrows. */
  facet: "slots";
  /** The slot whose rule the narrowing cancels. */
  slot: string;
  /** The two rows in conflict, in the order the message names them. */
  rows: [ConflictingRow, ConflictingRow];
  /** The whole finding as one sentence, ready to print. */
  message: string;
}

/** Options for {@link findUnsatisfiable}. */
export interface UnsatisfiableOptions {
  /**
   * Ids of narrowings to accept as deliberate, so an intended exception does
   * not have to be a permanent warning.
   */
  allow?: readonly string[];
}

// -- describing a condition ---------------------------------------------------

function literal(value: string | number | boolean): string {
  return JSON.stringify(value);
}

// "a", "a or b", "a, b or c" — the message says which values activate the row.
function values(list: (string | number | boolean)[]): string {
  const written = list.map(literal);
  const last = written.at(-1) ?? "";

  return written.length < 2
    ? last
    : `${written.slice(0, -1).join(", ")} or ${last}`;
}

function describe(when: NormalizedCondition): string {
  if ("all" in when) {
    return `(${when.all.map(describe).join(" and ")})`;
  }

  if ("any" in when) {
    return `(${when.any.map(describe).join(" or ")})`;
  }

  if ("not" in when) {
    // A composite already brings its own parentheses; an atom needs them.
    const inner = describe(when.not);

    return inner.startsWith("(") ? `not ${inner}` : `not (${inner})`;
  }

  return when.values === undefined
    ? `${when.prop} is present`
    : `${when.prop} is ${values(when.values)}`;
}

// -- preparation --------------------------------------------------------------

interface PreparedSlot {
  name: string;
  min: number;
  max: number;
}

interface PreparedRow {
  index: number;
  when: WhenCondition | undefined;
  /** Canonical form of `when`, for the cache key and the message. */
  normalized: NormalizedCondition | undefined;
  /** Absent where the row declares no slots: it sits out the intersection. */
  slots: PreparedSlot[] | undefined;
  requires: { from: string; to: string }[];
}

interface ComponentRows {
  component: string;
  rows: PreparedRow[];
}

// Count-bound defaults, as the combination reads them: neither bound means at
// most one, `minCount` alone lifts the upper bound, `maxCount` alone keeps a
// lower bound of nought.
function prepareSlot(raw: string | SlotConfig): PreparedSlot {
  const slot = typeof raw === "string" ? { name: raw } : raw;

  return {
    name: slot.name,
    min: slot.minCount ?? 0,
    max: slot.maxCount ?? (slot.minCount === undefined ? 1 : Infinity),
  };
}

function prepareRow(row: SlotsRow, index: number): PreparedRow {
  return {
    index,
    when: row.when,
    normalized:
      row.when === undefined ? undefined : normalizeCondition(row.when),
    slots: row.slots?.map(prepareSlot),
    requires: Object.entries(row.requires ?? {}).map(([from, to]) => ({
      from,
      to,
    })),
  };
}

/**
 * The slots rows, grouped by component. Grouping is by component name alone,
 * exactly as the engine groups: import gates are globs, so two rows naming one
 * component under different gates may both match one element. Two gates that
 * cannot overlap would make a pair unreachable, but deciding that is the same
 * kind of reasoning the check declines to do about conditions — so gates are
 * left out, in the co-satisfiable direction. A slot's own gate is left out for
 * the same reason: the combination intersects the two rows' gates for a slot
 * both declare, and whether the result can match anything is a question about
 * globs, not about the narrowing this check is scoped to.
 */
function prepare(rows: ContractRows): ComponentRows[] {
  const groups = new Map<string, PreparedRow[]>();

  rows.forEach((row, index) => {
    if (row.facet !== "slots") {
      return;
    }

    const group = groups.get(row.component) ?? [];

    group.push(prepareRow(row, index));
    groups.set(row.component, group);
  });

  return [...groups].map(([component, group]) => ({
    component,
    rows: group,
  }));
}

// -- the analysis -------------------------------------------------------------

function rowLabel(row: PreparedRow): string {
  return row.normalized === undefined
    ? `the unconditional row (rows[${row.index}])`
    : `the row conditional on \`${describe(row.normalized)}\` (rows[${row.index}])`;
}

function conflicting(row: PreparedRow): ConflictingRow {
  return row.when === undefined
    ? { index: row.index }
    : { index: row.index, when: row.when };
}

// The narrowings `other` performs on what `source` states. Called both ways
// round for a pair, because every one of the three is directional.
function pairNarrowings(
  component: string,
  source: PreparedRow,
  other: PreparedRow,
  report: (narrowing: Narrowing) => void,
): void {
  // A row declaring no slots is the identity for the intersection: it says
  // nothing about which children are allowed, so it narrows nothing.
  if (source.slots === undefined || other.slots === undefined) {
    return;
  }

  const otherSlots = other.slots;
  const survives = (name: string): boolean =>
    otherSlots.some((slot) => slot.name === name);

  const narrowing = (
    kind: NarrowingKind,
    slot: string,
    message: string,
  ): void => {
    report({
      id: `${kind}/${component}/${slot}`,
      kind,
      component,
      facet: "slots",
      slot,
      rows: [conflicting(source), conflicting(other)],
      message: `${component} (slots): ${message}`,
    });
  };

  for (const slot of source.slots) {
    const counterpart = other.slots.find((each) => each.name === slot.name);

    if (counterpart === undefined) {
      if (slot.min > 0) {
        narrowing(
          "excludedSlot",
          slot.name,
          `<${slot.name}> is required by ${rowLabel(source)} and excluded by ` +
            `${rowLabel(other)}. While both are active the slot is neither ` +
            "allowed nor required, so the requirement silently does not apply.",
        );
      }

      continue;
    }

    // Tightening from both ends can cross the bounds over; the combination
    // clamps the lower one down, which is where the requirement is lost.
    if (slot.min > counterpart.max) {
      narrowing(
        "crossedBounds",
        slot.name,
        `<${slot.name}> is required at least ${slot.min} times by ` +
          `${rowLabel(source)} and allowed at most ${counterpart.max} by ` +
          `${rowLabel(other)}. While both are active the lower bound is ` +
          `clamped down to ${counterpart.max}, so the requirement silently ` +
          "weakens.",
      );
    }
  }

  for (const reference of source.requires) {
    // The reference is dropped whenever either end fails to survive, but only
    // a surviving referrer makes that a rule that stopped applying: where the
    // referrer is excluded too, it cannot render at all and the requirement is
    // enforced more strictly, not less.
    if (survives(reference.from) && !survives(reference.to)) {
      narrowing(
        "droppedReference",
        reference.to,
        `${rowLabel(source)} requires <${reference.from}> to render ` +
          `alongside <${reference.to}>, and ${rowLabel(other)} excludes ` +
          `<${reference.to}>. While both are active the reference is dropped, ` +
          "so the requirement silently does not apply.",
      );
    }
  }
}

function analyze(groups: ComponentRows[]): readonly Narrowing[] {
  // One oracle for the whole table: a condition hoisted to a constant and
  // shared across components is decided once.
  const exclusivity: Exclusivity = createExclusivity();
  const found: Narrowing[] = [];
  const seen = new Set<string>();

  const report = (narrowing: Narrowing): void => {
    if (seen.has(narrowing.id)) {
      return;
    }

    seen.add(narrowing.id);
    found.push(Object.freeze(narrowing));
  };

  for (const { component, rows } of groups) {
    // Only pairs the check believes can be simultaneously active. Each of the
    // three narrowings is caused by two rows interacting, so pairs are enough:
    // a third row can neither create nor undo one.
    for (const [position, source] of rows.entries()) {
      for (const other of rows.slice(position + 1)) {
        if (exclusivity(source.normalized, other.normalized)) {
          continue;
        }

        pairNarrowings(component, source, other, report);
        pairNarrowings(component, other, source, report);
      }
    }
  }

  return Object.freeze(found);
}

// Findings, keyed on the content of the rows they were computed from — never on
// the identity of the contract object, so a table rebuilt from the same chain
// hits the cache. The check is quadratic in a component's rows and runs over
// every slot of every pair; a build tool that calls it per file would otherwise
// pay for it every time.
//
// Bounded, because the process holding it may be a long-lived one checking many
// tables: insertion order is eviction order, and the limit is well past the one
// or two tables a project has.
const CACHE_LIMIT = 16;
const cache = new Map<string, readonly Narrowing[]>();

function remember(key: string, found: readonly Narrowing[]): void {
  const oldest =
    cache.size < CACHE_LIMIT ? undefined : cache.keys().next().value;

  if (oldest !== undefined) {
    cache.delete(oldest);
  }

  cache.set(key, found);
}

/**
 * Report where a component's rows can combine into something no file could
 * satisfy — a rule the combination cancels, which would otherwise silently stop
 * applying with nothing to show for it.
 *
 * Opt-in and separate from `rules()`: it reports rather than throws, because
 * the narrowing it describes is legal and may be intended. Run it in a build
 * step or a test and decide there what a finding is worth.
 *
 * Three narrowings are reported, all on the children facet — the only one whose
 * combination narrows rather than unions: a slot one row requires and another
 * excludes, count bounds tightening past each other, and a cross-slot reference
 * whose target did not survive the intersection.
 *
 * Only pairs of rows whose conditions the check believes can hold at once are
 * considered, so the widening idiom — every row conditional and mutually
 * exclusive — stays quiet. Exclusivity is decided syntactically; anything
 * undecidable counts as co-satisfiable, so the check may miss a conflict but
 * never invents one.
 *
 * The result is frozen and shared: two content-equal tables get the identical
 * array back.
 *
 * @example
 * const found = findUnsatisfiable(mergeContracts(tray, button), {
 *   allow: ["excludedSlot/Widget.Tray/Widget.Tray.Title"],
 * });
 *
 * if (found.length > 0) {
 *   console.error(found.map((narrowing) => narrowing.message).join("\n"));
 * }
 */
export function findUnsatisfiable(
  contracts: CompiledContracts,
  options: UnsatisfiableOptions = {},
): readonly Narrowing[] {
  const groups = prepare(contracts.rows);
  // The canonical projection: normalized conditions, prepared bounds, no raw
  // payload. Two tables that say the same thing key alike however they were
  // written. `allow` stays out of it — it only filters the findings, so one
  // analysis serves every list.
  const key = JSON.stringify(
    groups.map(({ component, rows }) => [
      component,
      rows.map((row) => [row.index, row.normalized, row.slots, row.requires]),
    ]),
  );

  let found = cache.get(key);

  if (found === undefined) {
    found = analyze(groups);
    remember(key, found);
  }

  const allow = new Set(options.allow ?? []);

  return allow.size === 0
    ? found
    : Object.freeze(found.filter((narrowing) => !allow.has(narrowing.id)));
}
