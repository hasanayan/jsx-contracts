// Compilation to the rule table: one component entry in, one row per facet it
// touches out. Both authoring surfaces — the component-keyed map and the
// fluent builder — funnel through here, which is why they emit the same rows.

import type {
  ContractRows,
  ForbiddenElement,
  PropsRow,
  RequiredDescendant,
  SlotConfig,
  SlotsRow,
  SubtreeRow,
  WhenCondition,
} from "@jsx-contracts/eslint-plugin";

import type { Gate, Literal } from "./contract-entry.js";
import type { CompiledContracts } from "./rule-table.js";
import { makeContracts } from "./rule-table.js";

// -- runtime shapes (the loosest view, after the type-level layer is gone) -----

interface RuntimeSlotSpec {
  count?: { min?: number; max?: number };
  from?: Gate;
}

interface RuntimeForbidObject {
  name: string;
  from?: Gate;
}

export interface RuntimeBan {
  is?: readonly Literal[];
  forbid?: readonly (string | RuntimeForbidObject)[];
  forbidProps?: readonly string[];
}

export interface RuntimeProps {
  required?: readonly (string | readonly string[])[];
  exclusive?: readonly (readonly [readonly string[], readonly string[]])[];
  deprecated?: Record<string, string | true>;
}

export interface RuntimeEntry {
  from?: Gate;
  slots?: Record<string, true | RuntimeSlotSpec>;
  requires?: Record<string, string>;
  exclusive?: readonly (readonly [readonly string[], readonly string[]])[];
  strict?: boolean;
  subtree?: Record<string, RuntimeBan>;
  descendants?: Record<string, true | RuntimeSlotSpec>;
  props?: RuntimeProps;
  deprecated?: string | true;
  notInside?: readonly (string | RuntimeForbidObject)[];
}

// A `forbid`/`notInside` entry as the payload wants it: a bare name stays a
// string, an object keeps its gate under the payload's key.
function forbiddenElement(
  entry: string | RuntimeForbidObject,
): string | ForbiddenElement {
  if (typeof entry === "string") {
    return entry;
  }

  const forbidden: ForbiddenElement = { name: entry.name };

  if (entry.from !== undefined) {
    forbidden.importPath = entry.from;
  }

  return forbidden;
}

export function compile(
  contracts: Record<string, RuntimeEntry>,
  sharedGate: Gate | undefined,
): CompiledContracts {
  // One flat table. A component contributes one row per facet it touches, in
  // facet order, so its rows stay together and read in the order they were
  // authored.
  const rows: ContractRows = [];

  for (const [component, entry] of Object.entries(contracts)) {
    const gate = entry.from ?? sharedGate;

    if (gate === undefined) {
      throw new Error(
        `defineContracts: component "${component}" has no import gate ` +
          "(pass a shared default gate or set `from` on the component).",
      );
    }

    const expand = (key: string): string =>
      key.startsWith(".") ? `${component}${key}` : key;

    const declaredSlotKeys = new Set(Object.keys(entry.slots ?? {}));

    // References are checked as written, before expansion.
    const requireDeclared = (reference: string): void => {
      if (!declaredSlotKeys.has(reference)) {
        throw new Error(
          `defineContracts: component "${component}" references slot ` +
            `"${reference}", which it does not declare.`,
        );
      }
    };

    if (entry.slots !== undefined) {
      const slotConfigs: SlotConfig[] = [];

      for (const [slotKey, spec] of Object.entries(entry.slots)) {
        const slotConfig: SlotConfig = { name: expand(slotKey) };

        if (spec !== true) {
          if (spec.count?.min !== undefined) {
            slotConfig.minCount = spec.count.min;
          }

          if (spec.count?.max !== undefined) {
            slotConfig.maxCount = spec.count.max;
          }

          if (spec.from !== undefined) {
            slotConfig.importPath = spec.from;
          }
        }

        slotConfigs.push(slotConfig);
      }

      const container: SlotsRow = {
        facet: "slots",
        importPath: gate,
        component,
        slots: slotConfigs,
      };

      if (entry.requires !== undefined) {
        const requires: Record<string, string> = {};

        for (const [key, value] of Object.entries(entry.requires)) {
          requireDeclared(key);
          requireDeclared(value);
          requires[expand(key)] = expand(value);
        }

        container.requires = requires;
      }

      if (entry.exclusive !== undefined) {
        container.exclusive = entry.exclusive.map(([groupA, groupB]) => {
          const expandGroup = (group: readonly string[]): string[] =>
            group.map((member) => {
              requireDeclared(member);

              return expand(member);
            });

          return [expandGroup(groupA), expandGroup(groupB)];
        });
      }

      if (entry.strict !== undefined) {
        container.strict = entry.strict;
      }

      rows.push(container);
    } else if (entry.requires !== undefined || entry.exclusive !== undefined) {
      // No slots, so every reference dangles — validate to surface the error.
      for (const reference of [
        ...Object.entries(entry.requires ?? {}).flat(),
        ...(entry.exclusive ?? []).flatMap(([groupA, groupB]) => [
          ...groupA,
          ...groupB,
        ]),
      ]) {
        requireDeclared(reference);
      }
    }

    if (entry.subtree !== undefined) {
      for (const [prop, ban] of Object.entries(entry.subtree)) {
        if (ban.is?.length === 0) {
          throw new Error(
            `defineContracts: component "${component}" subtree ban on prop ` +
              `"${prop}" has an empty \`is\`.`,
          );
        }

        if (ban.forbid?.length === 0) {
          throw new Error(
            `defineContracts: component "${component}" subtree ban on prop ` +
              `"${prop}" has an empty \`forbid\`.`,
          );
        }

        if (ban.forbidProps?.length === 0) {
          throw new Error(
            `defineContracts: component "${component}" subtree ban on prop ` +
              `"${prop}" has an empty \`forbidProps\`.`,
          );
        }

        if (
          (ban.forbid?.length ?? 0) === 0 &&
          (ban.forbidProps?.length ?? 0) === 0
        ) {
          throw new Error(
            `defineContracts: component "${component}" subtree ban on prop ` +
              `"${prop}" must forbid an element or a prop.`,
          );
        }

        const when: WhenCondition =
          ban.is === undefined ? { prop } : { prop, values: [...ban.is] };

        const row: SubtreeRow = {
          facet: "subtree",
          importPath: gate,
          component,
          when,
        };

        if (ban.forbid !== undefined) {
          row.forbid = ban.forbid.map(forbiddenElement);
        }

        if (ban.forbidProps !== undefined) {
          row.forbidProps = [...ban.forbidProps];
        }

        rows.push(row);
      }
    }

    // Descendant counts compile to one when-less row per component, carrying
    // `require` entries. It sits beside any conditional bans from `subtree`.
    if (entry.descendants !== undefined) {
      const require: RequiredDescendant[] = [];

      for (const [key, spec] of Object.entries(entry.descendants)) {
        const required: RequiredDescendant = { name: expand(key) };

        if (spec !== true) {
          if (spec.count?.min !== undefined) {
            required.min = spec.count.min;
          }

          if (spec.count?.max !== undefined) {
            required.max = spec.count.max;
          }

          if (spec.from !== undefined) {
            required.importPath = spec.from;
          }
        }

        require.push(required);
      }

      if (require.length > 0) {
        rows.push({ facet: "subtree", importPath: gate, component, require });
      }
    }

    const propsRow: PropsRow = { facet: "props", importPath: gate, component };
    let hasProps = false;

    if (entry.props?.required !== undefined) {
      propsRow.required = entry.props.required.map((requirement) => {
        if (typeof requirement === "string") {
          return requirement;
        }

        if (requirement.length === 0) {
          throw new Error(
            `defineContracts: component "${component}" has an empty required ` +
              "prop group.",
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
            `defineContracts: component "${component}" has an empty ` +
              "exclusive prop group.",
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

    // One AncestorConfig row per component with forbidden ancestors, restamped
    // with the gate. An empty list emits no row (the tuple type forbids it, but
    // untyped callers may still reach here).
    if (entry.notInside !== undefined) {
      const notInside = entry.notInside.map(forbiddenElement);

      if (notInside.length > 0) {
        rows.push({
          facet: "ancestor",
          importPath: gate,
          component,
          notInside,
        });
      }
    }
  }

  return makeContracts(rows);
}
