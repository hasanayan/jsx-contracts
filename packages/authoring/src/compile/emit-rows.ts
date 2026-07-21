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

import type { CompiledContracts } from "./compiled-contracts.js";
import { makeContracts } from "./compiled-contracts.js";
import type { Forbid, Gate, RuntimeEntry } from "./entry.js";

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
    subtreeRow.forbid = entry.forbid.map(forbiddenElement);
    hasSubtree = true;
  }

  if (entry.forbidProps !== undefined) {
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
    propsRow.required = entry.props.required.map((requirement) =>
      typeof requirement === "string" ? requirement : [...requirement],
    );

    hasProps = true;
  }

  if (entry.props?.exclusive !== undefined) {
    propsRow.exclusive = entry.props.exclusive.map(([groupA, groupB]) => [
      [...groupA],
      [...groupB],
    ]);

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
    const ancestorRow: AncestorRow = {
      facet: "ancestor",
      importPath: gate,
      component,
      notInside: entry.notInside.map(forbiddenElement),
    };

    if (when !== undefined) {
      ancestorRow.when = when;
    }

    rows.push(ancestorRow);
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

/**
 * One named contract as a rule table: the component, the gate its binding
 * stated, and the entry its chain accumulated. Emission only — shorthand
 * expansion, when-conjunction and facet fan-out. What an entry may hold is
 * guarded by the builder method that received it, so nothing here rejects.
 */
export function compile(
  component: string,
  gate: Gate,
  entry: RuntimeEntry,
): CompiledContracts {
  const rows: ContractRows = [];

  emitRows(rows, component, gate, entry, undefined);

  return makeContracts(rows);
}
