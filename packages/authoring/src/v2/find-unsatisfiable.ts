/**
 * The ADR 0003 authoring-side conflict check, against the v2 surface. Reports
 * where a component's branches can hold at once and disagree — a rule the
 * combination cancels, which would otherwise silently stop applying with
 * nothing to show for it.
 *
 * Opt-in and separate from `rules()`: it reports rather than throws, because the
 * disagreement it describes is legal to author and may be intended.
 *
 * Three conflict classes, all on the children facet:
 *
 * - **requiredSlotForbidden** — a slot one layer requires (a base slot with a
 *   minimum, or a branch's `requireSlot`) and a co-active branch forbids.
 * - **extendForbidden** — a slot one branch extends and a co-active branch
 *   forbids: forbid wins over extend, so the extension is dead.
 * - **divergentOverride** — a slot two co-active branches redeclare with
 *   different specs, so the effective spec is ambiguous.
 *
 * Only pairs of layers whose conditions can hold at once are considered, so an
 * exclusive pair (disjoint prop values, a condition against its negation, those
 * distributed through `allOf`/`anyOf`) stays quiet. Co-satisfiability is decided
 * syntactically over the condition AST; anything undecidable counts as
 * co-satisfiable, so the check may miss a conflict but never invents one.
 */

import type {
  MatchKey,
  SlotBranchV2,
  SlotV2,
  SlotsRowV2,
  WhenV2,
} from "@jsx-contracts/eslint-plugin";

import type { Exclusivity } from "../check/exclusivity.js";
import { createExclusivity } from "../check/exclusivity.js";
import type { NormalizedCondition } from "../pinned/condition-semantics.js";
import { normalizeCondition } from "../pinned/condition-semantics.js";

import type { RuleSetV2 } from "./define-contracts.js";

/** Which class of disagreement a conflict names. */
export type ConflictKind =
  /** A slot one layer requires and a co-active branch forbids. */
  | "requiredSlotForbidden"
  /** A slot one branch extends and a co-active branch forbids. */
  | "extendForbidden"
  /** A slot two co-active branches redeclare with different specs. */
  | "divergentOverride";

/**
 * One of the two layers a conflict names: a branch identified by its condition,
 * or the always-active base children map, which carries no condition.
 */
export interface ConflictingBranch {
  /** The branch's condition, as authored. Absent on the base children map. */
  when?: WhenV2;
}

/** One rule a component's branches cancel between them. */
export interface Conflict {
  /**
   * Stable identity of this conflict: kind, component and slot. Pass it to
   * `allow` to accept a deliberate one.
   */
  id: string;
  kind: ConflictKind;
  component: string;
  /** Always the children facet — the only one whose branches combine. */
  facet: "slots";
  /** The slot the conflict cancels, by display name. */
  slot: string;
  /** The two layers in conflict, in the order the message names them. */
  branches: [ConflictingBranch, ConflictingBranch];
  /** The whole finding as one sentence, ready to print. */
  message: string;
}

/** Options for {@link findUnsatisfiable}. */
export interface UnsatisfiableOptions {
  /**
   * Ids of conflicts to accept as deliberate, so an intended exception does not
   * have to be a permanent warning.
   */
  allow?: readonly string[];
}

// The plugin's `displayName`, restated: `authoring` stays type-only over the
// plugin, so it cannot call the value. Only the `name` variant ships today.
function displayName(match: MatchKey): string {
  return match.name;
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

function describe(when: WhenV2): string {
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

/** One layer of a component's children facet: the base map, or one branch. */
interface Layer {
  /** The condition gating this layer; absent on the always-active base map. */
  when: WhenV2 | undefined;
  /** Canonical form of `when`, for the co-satisfiability test. */
  normalized: NormalizedCondition | undefined;
  /** Aliases this layer requires: base minimums, or a branch's `requireSlot`. */
  requires: Set<string>;
  /** Aliases this layer forbids. */
  forbids: Set<string>;
  /** Slots this layer extends, by alias. */
  extend: Map<string, SlotV2>;
}

function baseLayer(row: SlotsRowV2): Layer {
  const requires = new Set<string>();

  for (const slot of row.slots) {
    if (slot.count?.min !== undefined && slot.count.min >= 1) {
      requires.add(slot.alias);
    }
  }

  return {
    when: undefined,
    normalized: undefined,
    requires,
    forbids: new Set(),
    extend: new Map(),
  };
}

function branchLayer(branch: SlotBranchV2): Layer {
  return {
    when: branch.when,
    normalized: normalizeCondition(branch.when),
    requires: new Set(branch.requireSlots ?? []),
    forbids: new Set(branch.forbidSlots ?? []),
    extend: new Map((branch.extend ?? []).map((slot) => [slot.alias, slot])),
  };
}

function layerLabel(layer: Layer): string {
  return layer.when === undefined
    ? "the base children map"
    : `the branch when \`${describe(layer.when)}\``;
}

function conflictingBranch(layer: Layer): ConflictingBranch {
  return layer.when === undefined ? {} : { when: layer.when };
}

/** The comparable part of a slot spec: everything the alias does not carry. */
function specKey(slot: SlotV2): string {
  return JSON.stringify({
    match: slot.match,
    from: slot.from,
    count: slot.count,
    requires: slot.requires,
    excludes: slot.excludes,
  });
}

/** A slots row's conflicts. `report` dedupes and orders across the component. */
function rowConflicts(
  row: SlotsRowV2,
  exclusivity: Exclusivity,
  report: (conflict: Conflict) => void,
): void {
  const component = displayName(row.match);
  const branches = row.branches ?? [];

  // A row with no branch has nothing to combine — the base map alone is a fact.
  if (branches.length === 0) {
    return;
  }

  const display = new Map<string, string>();

  for (const slot of row.slots) {
    display.set(slot.alias, displayName(slot.match));
  }

  for (const branch of branches) {
    for (const slot of branch.extend ?? []) {
      if (!display.has(slot.alias)) {
        display.set(slot.alias, displayName(slot.match));
      }
    }
  }

  const displayOf = (alias: string): string => display.get(alias) ?? alias;

  const layers: Layer[] = [baseLayer(row), ...branches.map(branchLayer)];

  const emit = (
    kind: ConflictKind,
    alias: string,
    ordered: [Layer, Layer],
    message: string,
  ): void => {
    const slot = displayOf(alias);

    report({
      id: `${kind}/${component}/${slot}`,
      kind,
      component,
      facet: "slots",
      slot,
      branches: [conflictingBranch(ordered[0]), conflictingBranch(ordered[1])],
      message: `${component} (slots): ${message}`,
    });
  };

  // A required slot forbidden while both layers are active.
  const requiredForbidden = (requirer: Layer, forbidder: Layer): void => {
    for (const alias of requirer.requires) {
      if (forbidder.forbids.has(alias)) {
        emit(
          "requiredSlotForbidden",
          alias,
          [requirer, forbidder],
          `<${displayOf(alias)}> is required by ${layerLabel(requirer)} and ` +
            `forbidden by ${layerLabel(forbidder)}. While both are active the ` +
            "slot is forbidden, so the requirement silently does not apply.",
        );
      }
    }
  };

  // A slot one branch extends, another forbids: forbid wins, the extend is dead.
  const extendForbidden = (extender: Layer, forbidder: Layer): void => {
    for (const alias of extender.extend.keys()) {
      if (forbidder.forbids.has(alias)) {
        emit(
          "extendForbidden",
          alias,
          [extender, forbidder],
          `<${displayOf(alias)}> is extended by ${layerLabel(extender)} and ` +
            `forbidden by ${layerLabel(forbidder)}. While both are active the ` +
            "forbid wins, so the extension silently does not apply.",
        );
      }
    }
  };

  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      const left = layers[i];
      const right = layers[j];

      if (
        left === undefined ||
        right === undefined ||
        exclusivity(left.normalized, right.normalized)
      ) {
        continue;
      }

      requiredForbidden(left, right);
      requiredForbidden(right, left);
      extendForbidden(left, right);
      extendForbidden(right, left);

      // Two branches redeclaring one slot with different specs — ambiguous.
      for (const [alias, slot] of left.extend) {
        const counterpart = right.extend.get(alias);

        if (
          counterpart !== undefined &&
          specKey(slot) !== specKey(counterpart)
        ) {
          emit(
            "divergentOverride",
            alias,
            [left, right],
            `<${displayOf(alias)}> is redeclared differently by ` +
              `${layerLabel(left)} and ${layerLabel(right)}. While both are ` +
              "active the two specs disagree, so the effective spec is ambiguous.",
          );
        }
      }
    }
  }
}

function analyze(rows: RuleSetV2["rows"]): readonly Conflict[] {
  const exclusivity = createExclusivity();
  const found: Conflict[] = [];
  const seen = new Set<string>();

  const report = (conflict: Conflict): void => {
    if (seen.has(conflict.id)) {
      return;
    }

    seen.add(conflict.id);
    found.push(Object.freeze(conflict));
  };

  for (const row of rows) {
    if (row.facet === "slots") {
      rowConflicts(row, exclusivity, report);
    }
  }

  return Object.freeze(found);
}

/**
 * Report where a component's branches can combine into something no file could
 * satisfy: a required slot a branch forbids, an extension a forbid cancels, or
 * two branches redeclaring one slot in disagreement.
 *
 * Opt-in and separate from `rules()` — it reports rather than throws.
 *
 * @example
 * const found = findUnsatisfiable(mergeContracts(card, menu), {
 *   allow: ["requiredSlotForbidden/Card/Card.Body"],
 * });
 *
 * if (found.length > 0) {
 *   console.error(found.map((conflict) => conflict.message).join("\n"));
 * }
 */
export function findUnsatisfiable(
  contracts: RuleSetV2,
  options: UnsatisfiableOptions = {},
): readonly Conflict[] {
  const found = analyze(contracts.rows);
  const allow = new Set(options.allow ?? []);

  return allow.size === 0
    ? found
    : Object.freeze(found.filter((conflict) => !allow.has(conflict.id)));
}
