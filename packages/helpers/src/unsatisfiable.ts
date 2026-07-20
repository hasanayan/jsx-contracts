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

function literal(value: string | number | boolean): string {
  return JSON.stringify(value);
}

// "a", "a or b", "a, b or c".
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
    const inner = describe(when.not);
    const parenthesized = inner.startsWith("(");

    return parenthesized ? `not ${inner}` : `not (${inner})`;
  }

  return when.values === undefined
    ? `${when.prop} is present`
    : `${when.prop} is ${values(when.values)}`;
}

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

/** A part's count bounds, both ends resolved. */
export interface CountBounds {
  min: number;
  max: number;
}

/**
 * The bounds a part's declaration asserts — a part asserts only what it writes.
 * A bare declaration is optional and at most one; a lower bound alone is
 * unbounded above; an upper bound alone leaves the part optional.
 *
 * The authoring-side mirror of the core's `resolveBounds`, which is the
 * canonical statement of the rule. Exported for the cross-package agreement
 * test, which pins the two copies to agree (see docs/adr/0002-*); not part of
 * this package's supported surface.
 */
export function resolveCountBounds(
  minCount: number | undefined,
  maxCount: number | undefined,
): CountBounds {
  return {
    min: minCount ?? 0,
    max: maxCount ?? (minCount === undefined ? 1 : Infinity),
  };
}

function prepareSlot(raw: string | SlotConfig): PreparedSlot {
  const slot = typeof raw === "string" ? { name: raw } : raw;

  return {
    name: slot.name,
    ...resolveCountBounds(slot.minCount, slot.maxCount),
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

/** The slots rows, grouped by component name alone, exactly as the engine groups. */
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

// The narrowings `other` performs on what `source` states. Directional: call it
// both ways round for a pair.
function pairNarrowings(
  component: string,
  source: PreparedRow,
  other: PreparedRow,
  report: (narrowing: Narrowing) => void,
): void {
  // A row declaring no slots is the identity for the intersection.
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
    for (const [position, source] of rows.entries()) {
      for (const other of rows.slice(position + 1)) {
        const cannotBothBeActive = exclusivity(
          source.normalized,
          other.normalized,
        );

        if (cannotBothBeActive) {
          continue;
        }

        pairNarrowings(component, source, other, report);
        pairNarrowings(component, other, source, report);
      }
    }
  }

  return Object.freeze(found);
}

// Findings, keyed on row content. Insertion order is eviction order.
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
 * the narrowing it describes is legal and may be intended.
 *
 * Three narrowings are reported, all on the children facet: a slot one row
 * requires and another excludes, count bounds tightening past each other, and a
 * cross-slot reference whose target did not survive the intersection.
 *
 * Only pairs of rows whose conditions can hold at once are considered, so the
 * widening idiom stays quiet. Exclusivity is decided syntactically; anything
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
