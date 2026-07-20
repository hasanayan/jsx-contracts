import type {
  AncestorRow,
  ContractRows,
  ForbiddenElement,
  PropsRow,
  RequiredDescendant,
  SlotConfig,
  SlotsRow,
  SubtreeRow,
  WhenCondition,
} from "@jsx-contracts/eslint-plugin";

import type { CompiledContracts } from "./rule-table.js";
import { makeContracts } from "./rule-table.js";

/** Module a component must be imported from for its contract to apply. */
export type Gate = string;

/** A prop value a when-condition activates on. */
export type Literal = string | number | boolean;

interface GatedElement {
  name: string;
  from?: Gate;
}

/** A forbidden element: a bare name, or a name gated by its own import. */
export type Forbid = string | GatedElement;

export interface RuntimeSlotSpec {
  count?: { min?: number; max?: number };
  from?: Gate;
}

export interface RuntimeProps {
  required?: readonly (string | readonly string[])[];
  exclusive?: readonly (readonly [readonly string[], readonly string[]])[];
  deprecated?: Record<string, string | true>;
}

/** One `when` call: the condition, and the nameless contract it gates. */
export interface RuntimeConditional {
  when: WhenCondition;
  rules: RuntimeEntry;
}

export interface RuntimeEntry {
  /**
   * The gate the binding stated. Optional in this runtime view alone: a
   * nameless contract inherits the gate of the component it is attached to.
   */
  from?: Gate;
  slots?: Record<string, RuntimeSlotSpec>;
  requires?: Record<string, string>;
  exclusive?: readonly (readonly [readonly string[], readonly string[]])[];
  strict?: boolean;
  descendants?: Record<string, RuntimeSlotSpec>;
  forbid?: readonly Forbid[];
  forbidProps?: readonly string[];
  props?: RuntimeProps;
  deprecated?: string | true;
  notInside?: readonly Forbid[];
  /** One entry per `when` call, in the order they were authored. */
  conditional?: readonly RuntimeConditional[];
}

function forbiddenElement(entry: Forbid): string | ForbiddenElement {
  if (typeof entry === "string") {
    return entry;
  }

  const forbidden: ForbiddenElement = { name: entry.name };

  if (entry.from !== undefined) {
    forbidden.importPath = entry.from;
  }

  return forbidden;
}

// Flattened operands: an `all` contributes its own operands.
function conjuncts(when: WhenCondition): WhenCondition[] {
  return typeof when === "object" && "all" in when ? when.all : [when];
}

// A `when` nested inside a nameless contract conjoins with the outer one.
function conjoin(
  outer: WhenCondition | undefined,
  inner: WhenCondition,
): WhenCondition {
  return outer === undefined
    ? inner
    : { all: [...conjuncts(outer), ...conjuncts(inner)] };
}

// One entry as rows: one per facet it touches, stamped with the component, the
// gate and the condition in force, then the same for its conditional rules.
function emitRows(
  rows: ContractRows,
  component: string,
  gate: Gate,
  entry: RuntimeEntry,
  when: WhenCondition | undefined,
): void {
  // Leading-dot shorthand, against the component the rules are attached to.
  const expand = (key: string): string =>
    key.startsWith(".") ? `${component}${key}` : key;

  const touchesSlots =
    entry.slots !== undefined ||
    entry.requires !== undefined ||
    entry.exclusive !== undefined ||
    entry.strict !== undefined;

  if (touchesSlots) {
    const container: SlotsRow = { facet: "slots", importPath: gate, component };

    if (when !== undefined) {
      container.when = when;
    }

    if (entry.slots !== undefined) {
      const slotConfigs: SlotConfig[] = [];

      for (const [slotKey, spec] of Object.entries(entry.slots)) {
        const slotConfig: SlotConfig = { name: expand(slotKey) };

        if (spec.count?.min !== undefined) {
          slotConfig.minCount = spec.count.min;
        }

        if (spec.count?.max !== undefined) {
          slotConfig.maxCount = spec.count.max;
        }

        if (spec.from !== undefined) {
          slotConfig.importPath = spec.from;
        }

        slotConfigs.push(slotConfig);
      }

      container.slots = slotConfigs;
    }

    if (entry.requires !== undefined) {
      const requires: Record<string, string> = {};

      for (const [key, value] of Object.entries(entry.requires)) {
        requires[expand(key)] = expand(value);
      }

      container.requires = requires;
    }

    if (entry.exclusive !== undefined) {
      container.exclusive = entry.exclusive.map(([groupA, groupB]) => [
        groupA.map(expand),
        groupB.map(expand),
      ]);
    }

    if (entry.strict !== undefined) {
      container.strict = entry.strict;
    }

    rows.push(container);
  }

  const subtreeRow: SubtreeRow = {
    facet: "subtree",
    importPath: gate,
    component,
  };

  let hasSubtree = false;

  if (when !== undefined) {
    subtreeRow.when = when;
  }

  if (entry.forbid !== undefined) {
    if (entry.forbid.length === 0) {
      throw new Error(
        `contract: component "${component}" calls forbidDescendants() with ` +
          "no elements.",
      );
    }

    subtreeRow.forbid = entry.forbid.map(forbiddenElement);
    hasSubtree = true;
  }

  if (entry.forbidProps !== undefined) {
    if (entry.forbidProps.length === 0) {
      throw new Error(
        `contract: component "${component}" calls forbidDescendantProps() ` +
          "with no props.",
      );
    }

    subtreeRow.forbidProps = [...entry.forbidProps];
    hasSubtree = true;
  }

  if (entry.descendants !== undefined) {
    const require: RequiredDescendant[] = [];

    for (const [key, spec] of Object.entries(entry.descendants)) {
      const required: RequiredDescendant = { name: expand(key) };

      if (spec.count?.min !== undefined) {
        required.min = spec.count.min;
      }

      if (spec.count?.max !== undefined) {
        required.max = spec.count.max;
      }

      if (spec.from !== undefined) {
        required.importPath = spec.from;
      }

      require.push(required);
    }

    if (require.length > 0) {
      subtreeRow.require = require;
      hasSubtree = true;
    }
  }

  if (hasSubtree) {
    rows.push(subtreeRow);
  }

  const propsRow: PropsRow = { facet: "props", importPath: gate, component };
  let hasProps = false;

  if (when !== undefined) {
    propsRow.when = when;
  }

  if (entry.props?.required !== undefined) {
    propsRow.required = entry.props.required.map((requirement) => {
      if (typeof requirement === "string") {
        return requirement;
      }

      if (requirement.length === 0) {
        throw new Error(
          `contract: component "${component}" calls requiresAnyProp() ` +
            "with no props.",
        );
      }

      return [...requirement];
    });

    hasProps = true;
  }

  if (entry.props?.exclusive !== undefined) {
    propsRow.exclusive = entry.props.exclusive.map(([groupA, groupB]) => {
      if (groupA.length === 0 || groupB.length === 0) {
        throw new Error(
          `contract: component "${component}" calls exclusiveProps() ` +
            "with an empty group.",
        );
      }

      return [[...groupA], [...groupB]];
    });

    hasProps = true;
  }

  if (entry.props?.deprecated !== undefined) {
    propsRow.deprecated = { ...entry.props.deprecated };
    hasProps = true;
  }

  if (entry.deprecated !== undefined) {
    propsRow.deprecatedComponent = entry.deprecated;
    hasProps = true;
  }

  if (hasProps) {
    rows.push(propsRow);
  }

  if (entry.notInside !== undefined) {
    const notInside = entry.notInside.map(forbiddenElement);

    if (notInside.length > 0) {
      const ancestorRow: AncestorRow = {
        facet: "ancestor",
        importPath: gate,
        component,
        notInside,
      };

      if (when !== undefined) {
        ancestorRow.when = when;
      }

      rows.push(ancestorRow);
    }
  }

  for (const conditional of entry.conditional ?? []) {
    emitRows(
      rows,
      component,
      gate,
      conditional.rules,
      conjoin(when, conditional.when),
    );
  }
}

export function compile(
  contracts: Record<string, RuntimeEntry>,
): CompiledContracts {
  const rows: ContractRows = [];

  for (const [component, entry] of Object.entries(contracts)) {
    const gate = entry.from;

    if (gate === undefined) {
      throw new Error(
        `contract: component "${component}" has no import gate ` +
          "(pass one to contractsFor()).",
      );
    }

    emitRows(rows, component, gate, entry, undefined);
  }

  return makeContracts(rows);
}
