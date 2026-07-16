// The `defineContracts` authoring DSL: a component-centric surface that
// compiles to the two rules' frozen JSON payloads. See CONTEXT.md for the terms.

import type {
  ContainerConfig,
  ForbiddenElement,
  NoDescendantsConfig,
  SlotConfig,
  WhenCondition,
} from "./contracts/validate.js";

/** Severity of an emitted rule. */
export type Severity = "error" | "warn";

/** The compiled payloads for both rules, plus a `rules()` helper. */
export interface CompiledContracts {
  /** The `@jsx-contracts/slots` payload. */
  slots: ContainerConfig[];
  /** The `@jsx-contracts/subtree` payload. */
  subtree: NoDescendantsConfig[];
  /**
   * Both rules as flat-config entries at the given severity (default
   * `"error"`), spreadable into an ESLint config's `rules`.
   *
   * @example
   * rules: contracts.rules(),
   * // or per rule:
   * rules: contracts.rules({ subtree: "warn" }),
   */
  rules(severity?: Severity | { slots?: Severity; subtree?: Severity }): {
    "@jsx-contracts/slots": [Severity, ContainerConfig[]];
    "@jsx-contracts/subtree": [Severity, NoDescendantsConfig[]];
  };
}

// -- authoring language (the input surface) -----------------------------------

type Gate = string;

type Literal = string | number | boolean;

type Forbid = string | { name: string; from?: Gate };

// Omitted bounds are left for the rule to default, never stamped here.
type SlotSpec = true | { count?: { min?: number; max?: number }; from?: Gate };

// The union makes each ban forbid at least one element or prop.
type SubtreeBan =
  | {
      is?: readonly [Literal, ...Literal[]];
      forbid: readonly [Forbid, ...Forbid[]];
      forbidProps?: readonly [string, ...string[]];
    }
  | {
      is?: readonly [Literal, ...Literal[]];
      forbid?: readonly [Forbid, ...Forbid[]];
      forbidProps: readonly [string, ...string[]];
    };

// Slot keys taken exactly as written (a leading dot stays), so the F-bound can
// constrain requires/exclusive to this entry's own slots.
type SlotKeys<Entry> = Entry extends { slots: infer Slots }
  ? Extract<keyof Slots, string>
  : never;

interface ComponentEntry<Entry> {
  from?: Gate;
  slots?: Record<string, SlotSpec>;
  requires?: Partial<Record<SlotKeys<Entry>, SlotKeys<Entry>>>;
  exclusive?: readonly (readonly [
    readonly SlotKeys<Entry>[],
    readonly SlotKeys<Entry>[],
  ])[];
  strict?: boolean;
  subtree?: Record<string, SubtreeBan>;
}

type ContractsInput<T> = {
  [Component in keyof T]: ComponentEntry<T[Component]>;
};

// -- runtime shapes (the loosest view, after the type-level layer is gone) -----

interface RuntimeSlotSpec {
  count?: { min?: number; max?: number };
  from?: Gate;
}

interface RuntimeForbidObject {
  name: string;
  from?: Gate;
}

interface RuntimeBan {
  is?: readonly Literal[];
  forbid?: readonly (string | RuntimeForbidObject)[];
  forbidProps?: readonly string[];
}

interface RuntimeEntry {
  from?: Gate;
  slots?: Record<string, true | RuntimeSlotSpec>;
  requires?: Record<string, string>;
  exclusive?: readonly (readonly [readonly string[], readonly string[]])[];
  strict?: boolean;
  subtree?: Record<string, RuntimeBan>;
}

/**
 * Author every component's contract in one map; compiles to the two rules'
 * payloads. `requires`/`exclusive` are type-checked against each component's
 * own slot keys.
 *
 * @param from - Shared import gate; a component may override it with its own `from`.
 * @example
 * const contracts = defineContracts("@acme/ds", {
 *   "Widget.Tray": {
 *     slots: { ".Title": { count: { min: 1 } }, ".Action": true },
 *     requires: { ".Action": ".Title" },
 *   },
 *   Widget: {
 *     subtree: { variant: { is: ["compact"], forbid: ["Widget.Footer"] } },
 *   },
 * });
 * // eslint.config.js → rules: contracts.rules()
 */
// `const` keeps slot keys, ban literals, and tuple shapes narrow, so the
// F-bound can constrain references and reject empty tuples.
export function defineContracts<const T extends ContractsInput<T>>(
  contracts: T,
): CompiledContracts;
export function defineContracts<const T extends ContractsInput<T>>(
  from: Gate,
  contracts: T,
): CompiledContracts;
export function defineContracts(
  fromOrContracts: Gate | Record<string, RuntimeEntry>,
  maybeContracts?: Record<string, RuntimeEntry>,
): CompiledContracts {
  const sharedGate =
    typeof fromOrContracts === "string" ? fromOrContracts : undefined;

  const contracts =
    typeof fromOrContracts === "string"
      ? (maybeContracts ?? {})
      : fromOrContracts;

  return compile(contracts, sharedGate);
}

function compile(
  contracts: Record<string, RuntimeEntry>,
  sharedGate: Gate | undefined,
): CompiledContracts {
  const slots: ContainerConfig[] = [];
  const subtree: NoDescendantsConfig[] = [];

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

      const container: ContainerConfig = {
        importPath: gate,
        container: component,
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

      slots.push(container);
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

        const row: NoDescendantsConfig = {
          importPath: gate,
          component,
          when,
        };

        if (ban.forbid !== undefined) {
          row.forbid = ban.forbid.map((entry_) => {
            if (typeof entry_ === "string") {
              return entry_;
            }

            const forbidden: ForbiddenElement = { name: entry_.name };

            if (entry_.from !== undefined) {
              forbidden.importPath = entry_.from;
            }

            return forbidden;
          });
        }

        if (ban.forbidProps !== undefined) {
          row.forbidProps = [...ban.forbidProps];
        }

        subtree.push(row);
      }
    }
  }

  return makeContracts(slots, subtree);
}

function makeContracts(
  slots: ContainerConfig[],
  subtree: NoDescendantsConfig[],
): CompiledContracts {
  return {
    slots,
    subtree,
    rules(
      severity: Severity | { slots?: Severity; subtree?: Severity } = "error",
    ): ReturnType<CompiledContracts["rules"]> {
      const slotsSeverity =
        typeof severity === "string" ? severity : (severity.slots ?? "error");

      const subtreeSeverity =
        typeof severity === "string" ? severity : (severity.subtree ?? "error");

      return {
        "@jsx-contracts/slots": [slotsSeverity, slots],
        "@jsx-contracts/subtree": [subtreeSeverity, subtree],
      };
    },
  };
}

/**
 * Merge any number of contracts — from `defineContracts`, `defineContract`, or
 * other `mergeContracts` calls — into one. The result is itself a contract, so
 * merges nest; call `rules()` once at the end, in your ESLint config.
 *
 * @example
 * const widgets = mergeContracts(widgetTray, widgetSubtree);
 * export const contracts = mergeContracts(widgets, menu, layout);
 * // eslint.config.js → rules: contracts.rules()
 */
export function mergeContracts(
  ...contracts: CompiledContracts[]
): CompiledContracts {
  return makeContracts(
    contracts.flatMap((entry) => entry.slots),
    contracts.flatMap((entry) => entry.subtree),
  );
}

// The non-slot half of one component's contract. `requires`/`exclusive`
// references are constrained to the slot keys passed alongside.
interface SingleContractConfig<Slots> {
  from: Gate;
  requires?: Partial<
    Record<Extract<keyof Slots, string>, Extract<keyof Slots, string>>
  >;
  exclusive?: readonly (readonly [
    readonly Extract<keyof Slots, string>[],
    readonly Extract<keyof Slots, string>[],
  ])[];
  strict?: boolean;
  subtree?: Record<string, SubtreeBan>;
}

/**
 * Author a single component's contract. Slots are the second argument so the
 * `requires`/`exclusive` references in `config` are type-checked against their
 * keys. Pass an empty `slots` object for a subtree-only component.
 *
 * @example
 * const contract = defineContract(
 *   "Widget.Tray",
 *   { ".Title": { count: { min: 1, max: 1 } }, ".Action": true },
 *   { from: "@acme/ds", requires: { ".Action": ".Title" } },
 * );
 * // eslint.config.js → rules: contract.rules()
 */
export function defineContract<const Slots extends Record<string, SlotSpec>>(
  component: string,
  slots: Slots,
  config: SingleContractConfig<Slots>,
): CompiledContracts {
  const entry: RuntimeEntry = {
    from: config.from,
    strict: config.strict,
    subtree: config.subtree,
  };

  // Empty slots means subtree-only: a container that accepts nothing is never
  // the intent.
  if (Object.keys(slots).length > 0) {
    entry.slots = slots;
  }

  if (config.requires !== undefined) {
    entry.requires = config.requires as Record<string, string>;
  }

  if (config.exclusive !== undefined) {
    entry.exclusive = config.exclusive;
  }

  return compile({ [component]: entry }, undefined);
}
