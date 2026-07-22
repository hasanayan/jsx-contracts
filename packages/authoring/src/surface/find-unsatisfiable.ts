/**
 * The ADR 0003 authoring-side conflict check: where a component's branches can
 * hold at once and disagree, cancelling a rule that would otherwise stop
 * applying with nothing to show for it.
 *
 * Only pairs whose conditions can hold at once are considered, so an exclusive
 * pair stays quiet. Co-satisfiability is decided syntactically over the
 * condition AST, and anything undecidable counts as co-satisfiable — the check
 * may miss a conflict but never invents one.
 */

import type {
  MatchKey,
  Slot,
  SlotBranch,
  SlotsRow,
  When,
} from "@jsx-contracts/eslint-plugin";

import type { Exclusivity } from "../check/exclusivity.js";
import { createExclusivity } from "../check/exclusivity.js";
import type { NormalizedCondition } from "../pinned/condition-semantics.js";
import { normalizeCondition } from "../pinned/condition-semantics.js";

import type { RuleSet } from "./define-contracts.js";

export type ConflictKind =
  /** A slot one layer requires and a co-active branch forbids. */
  | "requiredSlotForbidden"
  /** A slot one branch extends and a co-active branch forbids. */
  | "extendForbidden"
  /** A slot two co-active branches redeclare with different specs. */
  | "divergentOverride";

/** A branch identified by its condition, or the always-active base map. */
export interface ConflictingBranch {
  /** The branch's condition, as authored. Absent on the base children map. */
  when?: When;
}

/** One rule a component's branches cancel between them. */
export interface Conflict {
  /** Kind, component and slot. Pass it to `allow` to accept a deliberate conflict. */
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

export interface UnsatisfiableOptions {
  /** Ids to accept as deliberate, so an intended exception is not a permanent warning. */
  allow?: readonly string[];
}

// Restated rather than imported: `authoring` stays type-only over the plugin.
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

function describe(when: When): string {
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

/** The base map, or one branch. */
interface Layer {
  /** The condition gating this layer; absent on the always-active base map. */
  when: When | undefined;
  /** Canonical form of `when`, for the co-satisfiability test. */
  normalized: NormalizedCondition | undefined;
  /** Aliases this layer requires: base minimums, or a branch's `requireSlot`. */
  requires: Set<string>;
  /** Aliases this layer forbids. */
  forbids: Set<string>;
  /** Slots this layer extends, by alias. */
  extend: Map<string, Slot>;
}

function baseLayer(row: SlotsRow): Layer {
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

function branchLayer(branch: SlotBranch): Layer {
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
function specKey(slot: Slot): string {
  return JSON.stringify({
    match: slot.match,
    count: slot.count,
    requires: slot.requires,
    excludes: slot.excludes,
  });
}

// `report` dedupes and orders across the component.
function rowConflicts(
  row: SlotsRow,
  exclusivity: Exclusivity,
  report: (conflict: Conflict) => void,
): void {
  const component = displayName(row.match);
  const branches = row.branches ?? [];

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

  // Forbid wins over extend, so the extension is dead.
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

function analyze(rows: RuleSet["rows"]): readonly Conflict[] {
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
 * Opt-in and separate from `rules()` — it reports rather than throws, because
 * the disagreement it describes is legal to author and may be intended.
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
  contracts: RuleSet,
  options: UnsatisfiableOptions = {},
): readonly Conflict[] {
  const found = analyze(contracts.rows);
  const allow = new Set(options.allow ?? []);

  return allow.size === 0
    ? found
    : Object.freeze(found.filter((conflict) => !allow.has(conflict.id)));
}
