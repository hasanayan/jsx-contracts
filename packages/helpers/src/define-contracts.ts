// The `defineContracts` authoring DSL: a component-centric surface that
// compiles to the three facets' frozen JSON payloads. See CONTEXT.md for the
// terms.

import type {
  AncestorConfig,
  ContainerConfig,
  ForbiddenElement,
  NoDescendantsConfig,
  PropsConfig,
  RequiredDescendant,
  SlotConfig,
  WhenCondition,
} from "./payload.js";

/** Severity of an emitted rule. */
export type Severity = "error" | "warn";

/** Per-facet or single severity for the emitted rules. */
type SeverityChoice =
  | Severity
  | {
      slots?: Severity;
      subtree?: Severity;
      props?: Severity;
      ancestor?: Severity;
    };

/** The compiled payloads for all four facets, plus a `rules()` helper. */
export interface CompiledContracts {
  /** The `@jsx-contracts/slots` payload. */
  slots: ContainerConfig[];
  /** The `@jsx-contracts/subtree` payload. */
  subtree: NoDescendantsConfig[];
  /** The `@jsx-contracts/props` payload. */
  props: PropsConfig[];
  /** The `@jsx-contracts/ancestor` payload. */
  ancestor: AncestorConfig[];
  /**
   * One flat-config entry per facet feature (`slots.children`, `slots.count`,
   * `subtree.forbid`, `subtree.count`, `props.deprecated`, `ancestor.forbid`,
   * …), at the given severity (default `"error"`), spreadable into an ESLint
   * config's `rules`. Consumers switch off or override a single feature — or
   * target it with an eslint-disable comment — without dropping the rest.
   * Enabling all thirteen costs one analysis per file, not thirteen: the rules
   * intern their payloads by content and share the per-file work across every
   * variant.
   *
   * @example
   * rules: {
   *   ...contracts.rules(), // or rules({ subtree: "warn" })
   *   "@jsx-contracts/slots.exclusive": "off",
   * },
   */
  rules(severity?: SeverityChoice): {
    "@jsx-contracts/slots.children": [Severity, ContainerConfig[]];
    "@jsx-contracts/slots.count": [Severity, ContainerConfig[]];
    "@jsx-contracts/slots.placement": [Severity, ContainerConfig[]];
    "@jsx-contracts/slots.requires": [Severity, ContainerConfig[]];
    "@jsx-contracts/slots.exclusive": [Severity, ContainerConfig[]];
    "@jsx-contracts/slots.strict": [Severity, ContainerConfig[]];
    "@jsx-contracts/subtree.forbid": [Severity, NoDescendantsConfig[]];
    "@jsx-contracts/subtree.forbidProps": [Severity, NoDescendantsConfig[]];
    "@jsx-contracts/subtree.count": [Severity, NoDescendantsConfig[]];
    "@jsx-contracts/props.required": [Severity, PropsConfig[]];
    "@jsx-contracts/props.exclusive": [Severity, PropsConfig[]];
    "@jsx-contracts/props.deprecated": [Severity, PropsConfig[]];
    "@jsx-contracts/ancestor.forbid": [Severity, AncestorConfig[]];
  };
}

// -- authoring language (the input surface) -----------------------------------

type Gate = string;

type Literal = string | number | boolean;

type Forbid = string | { name: string; from?: Gate };

// Omitted bounds are left for the rule to default, never stamped here.
/** `true` = default bounds (at most one); otherwise count bounds and/or an own gate. */
type SlotSpec = true | { count?: { min?: number; max?: number }; from?: Gate };

// One ban's fields; `SubtreeBan` below makes it forbid at least one thing.
interface SubtreeBanFields {
  /**
   * Activate only when the prop's value is one of these literals; omitted, the
   * ban activates on prop presence.
   */
  is?: readonly [Literal, ...Literal[]];
  /** Elements barred anywhere below the activated component. */
  forbid?: readonly [Forbid, ...Forbid[]];
  /** Props barred on every element below the activated component. */
  forbidProps?: readonly [string, ...string[]];
}

// The union makes each ban forbid at least one element or prop.
type SubtreeBan =
  | (SubtreeBanFields & { forbid: readonly [Forbid, ...Forbid[]] })
  | (SubtreeBanFields & { forbidProps: readonly [string, ...string[]] });

// Slot keys taken exactly as written (a leading dot stays), so the F-bound can
// constrain requires/exclusive to this entry's own slots.
type SlotKeys<Entry> = Entry extends { slots: infer Slots }
  ? Extract<keyof Slots, string>
  : never;

/** Element-local prop contracts for one component. */
interface PropsEntry {
  /**
   * Props that must be present. A bare string names one required prop; a
   * non-empty tuple is an at-least-one-of group.
   */
  required?: (string | readonly [string, ...string[]])[];
  /** Pairs of non-empty prop groups that may not co-occur. */
  exclusive?: readonly (readonly [
    readonly [string, ...string[]],
    readonly [string, ...string[]],
  ])[];
  /** Deprecated prop → a replacement hint, or `true` for a bare deprecation. */
  deprecated?: Record<string, string | true>;
}

interface ComponentEntry<Entry> {
  /** Import gate for this component; overrides the shared default. */
  from?: Gate;
  /**
   * Slots keyed by name; a key starting with `.` is shorthand for
   * `<Component><key>` (`".Title"` under `Widget.Tray` → `Widget.Tray.Title`).
   */
  slots?: Record<string, SlotSpec>;
  /** Slot-to-slot requirement: each key slot must co-render with its value slot. */
  requires?: Partial<Record<SlotKeys<Entry>, SlotKeys<Entry>>>;
  /** Pairs of slot groups that may not co-render. */
  exclusive?: readonly (readonly [
    readonly SlotKeys<Entry>[],
    readonly SlotKeys<Entry>[],
  ])[];
  /** Report unresolvable children as violations; presence checks always run. */
  strict?: boolean;
  /** Subtree bans keyed by the prop that activates them. */
  subtree?: Record<string, SubtreeBan>;
  /**
   * Descendants required anywhere below this component, with count bounds — a
   * gap the direct-child slots facet can't close (wrappers may sit between a
   * root and its parts). Keyed by name; a key starting with `.` is shorthand
   * for `<Component><key>` (`".List"` under `Tabs.Root` → `Tabs.Root.List`).
   * `true` = default bounds (at most one); otherwise count bounds and/or an own
   * gate. Always active for the matched component — no `when`.
   */
  descendants?: Record<string, SlotSpec>;
  /** Element-local prop contracts: required, exclusive, and deprecated props. */
  props?: PropsEntry;
  /** The component itself is deprecated; a string is a replacement hint. */
  deprecated?: string | true;
  /**
   * Ancestors this component may not render below (anywhere in the file's JSX
   * tree, not just as a direct child). A bare string matches by name only; an
   * object additionally gates the ancestor by its `from` import. Use it for
   * HTML-validity and interaction contracts — no `<Button>` inside a `<Button>`,
   * no `<Link>` inside a `<Link>`. Only the forbidden direction is enforced;
   * requiring an ancestor is deliberately not offered (it is unsound per-file).
   */
  notInside?: readonly [Forbid, ...Forbid[]];
}

// The loosest single-entry view (slot keys unresolved). This is the inference
// constraint: the F-bounded `ContractsInput<T>` alone leaves the language
// service without a contextual type mid-literal (T is still being inferred
// from the very literal being typed), killing completions and hover docs.
type AnyComponentEntry = ComponentEntry<{ slots: Record<string, SlotSpec> }>;

// The traps are branded objects, not `never` or error-string types: those
// would intersect with the literal's own property type to `never`, and TS then
// collapses the whole entry intersection to `never`, moving the error onto
// sibling lines. A brand intersects cleanly, so the error stays on the
// offending property.
interface UndeclaredSlot<Key> {
  "Error: this key is not a declared slot of the component": Key;
}

interface UnknownOption<Key> {
  "Error: this is not a contract entry option": Key;
}

interface UnknownPropsOption<Key> {
  "Error: this is not a props contract option": Key;
}

// Because `T` (the literal's own type) is intersected into the parameter,
// excess-property checking can no longer reject a `requires` key or an entry
// option that only exists on `T`. This validator traps both instead: the
// offending property's type gains a brand nothing satisfies.
type ValidEntry<Entry> = (Entry extends {
  requires: infer Requires extends object;
}
  ? {
      requires: {
        [Key in keyof Requires]: Key extends SlotKeys<Entry>
          ? SlotKeys<Entry>
          : UndeclaredSlot<Key>;
      };
    }
  : unknown) &
  // Excess-property checking is defeated inside a nested object too (the
  // literal's own type is intersected in), so the `props` sub-object needs the
  // same brand trap the top-level options get.
  (Entry extends { props: infer Props extends object }
    ? {
        props: {
          [Key in keyof Props]: Key extends keyof PropsEntry
            ? PropsEntry[Key]
            : UnknownPropsOption<Key>;
        };
      }
    : unknown) & {
    [Key in keyof Entry]: Key extends keyof ComponentEntry<Entry>
      ? ComponentEntry<Entry>[Key]
      : UnknownOption<Key>;
  };

interface UnknownComponent<Key> {
  "Error: this is not a capitalized export path of the contracts module": Key;
}

type ContractsInput<T, Names extends string = string> = {
  [Component in keyof T]: Component extends Names
    ? ComponentEntry<T[Component]> & ValidEntry<T[Component]>
    : UnknownComponent<Component>;
};

// -- module-typed component names (`contractsFor`) ----------------------------

// Dotted capitalized export paths of a module: "Widget", "Widget.Tray",
// "Widget.Tray.Title". JSX only renders capitalized identifiers, so lowercase
// exports (helpers, constants) never name a contract. Three segments deep —
// as deep as compound components realistically nest.
type ComponentPaths<Module> = ModulePaths<Module, [0, 0]>;

type ModulePaths<Owner, Depth extends readonly unknown[]> = Owner extends object
  ? {
      [Key in keyof Owner & string]: Key extends `${infer Head}${string}`
        ? Head extends Lowercase<Head>
          ? never
          : | Key
            | (Depth extends readonly [unknown, ...infer Rest]
                ? `${Key}.${ModulePaths<Owner[Key], Rest>}`
                : never)
        : never;
    }[keyof Owner & string]
  : never;

// Without a module type argument the names degrade to unconstrained strings
// instead of rejecting everything.
type ComponentNames<Module> = unknown extends Module
  ? string
  : ComponentPaths<Module>;

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

interface RuntimeProps {
  required?: readonly (string | readonly string[])[];
  exclusive?: readonly (readonly [readonly string[], readonly string[]])[];
  deprecated?: Record<string, string | true>;
}

interface RuntimeEntry {
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
// F-bound can constrain references and reject empty tuples. The constraint is
// deliberately the loose `AnyComponentEntry` (see there); the F-bound lives in
// the parameter's `ContractsInput<T>` intersection instead.
export function defineContracts<
  const T extends Record<string, AnyComponentEntry>,
>(contracts: T & ContractsInput<T>): CompiledContracts;
export function defineContracts<
  const T extends Record<string, AnyComponentEntry>,
>(from: Gate, contracts: T & ContractsInput<T>): CompiledContracts;
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

/**
 * Bind `defineContracts` to a gate and a module's types: component names are
 * completed and checked against the module's capitalized export paths, so a
 * typo — or a component renamed away in the design system — fails to compile.
 * `typeof import("...")` is type-only; the module is never loaded at runtime,
 * so the ESLint config stays free of the design system's runtime dependencies.
 *
 * @param from - Shared import gate; a component may override it with its own `from`.
 * @example
 * const define = contractsFor<typeof import("@acme/ds")>("@acme/ds");
 * export const contracts = define({
 *   "Widget.Tray": {
 *     slots: { ".Title": { count: { min: 1 } }, ".Action": true },
 *     requires: { ".Action": ".Title" },
 *   },
 * });
 * // eslint.config.js → rules: contracts.rules()
 */
export function contractsFor<Module>(from: Gate): BoundContracts<Module> {
  const define = (
    contracts: Record<string, RuntimeEntry | undefined>,
  ): CompiledContracts => {
    // The map form's `Partial` admits explicit `undefined` entries (from
    // untyped callers); drop them before compiling.
    const present: Record<string, RuntimeEntry> = {};

    for (const [component, entry] of Object.entries(contracts)) {
      if (entry !== undefined) {
        present[component] = entry;
      }
    }

    return compile(present, from);
  };

  // The generic call signature only exists at the type level; the runtime
  // shape is the plain function plus the bound `contract` starter.
  return Object.assign(define, {
    contract: (component: string): ContractBuilder<never> =>
      contract(component, from),
  });
}

/** What `contractsFor` returns: `defineContracts` and `contract`, gate- and module-bound. */
export interface BoundContracts<Module> {
  /** The contracts map, exactly as `defineContracts` takes it. */
  <const T extends Partial<Record<ComponentNames<Module>, AnyComponentEntry>>>(
    contracts: T & ContractsInput<T, ComponentNames<Module>>,
  ): CompiledContracts;
  /** Fluent alternative: start one component's contract builder. */
  contract(component: ComponentNames<Module>): ContractBuilder<never>;
}

function compile(
  contracts: Record<string, RuntimeEntry>,
  sharedGate: Gate | undefined,
): CompiledContracts {
  const slots: ContainerConfig[] = [];
  const subtree: NoDescendantsConfig[] = [];
  const props: PropsConfig[] = [];
  const ancestor: AncestorConfig[] = [];

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
        subtree.push({ importPath: gate, component, require });
      }
    }

    const propsRow: PropsConfig = { importPath: gate, component };
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
      props.push(propsRow);
    }

    // One AncestorConfig row per component with forbidden ancestors, restamped
    // with the gate. An empty list emits no row (the tuple type forbids it, but
    // untyped callers may still reach here).
    if (entry.notInside !== undefined) {
      const notInside = entry.notInside.map((entry_) => {
        if (typeof entry_ === "string") {
          return entry_;
        }

        const forbidden: ForbiddenElement = { name: entry_.name };

        if (entry_.from !== undefined) {
          forbidden.importPath = entry_.from;
        }

        return forbidden;
      });

      if (notInside.length > 0) {
        ancestor.push({ importPath: gate, component, notInside });
      }
    }
  }

  return makeContracts(slots, subtree, props, ancestor);
}

function facetSeverities(severity: SeverityChoice): {
  slotsSeverity: Severity;
  subtreeSeverity: Severity;
  propsSeverity: Severity;
  ancestorSeverity: Severity;
} {
  return {
    slotsSeverity:
      typeof severity === "string" ? severity : (severity.slots ?? "error"),
    subtreeSeverity:
      typeof severity === "string" ? severity : (severity.subtree ?? "error"),
    propsSeverity:
      typeof severity === "string" ? severity : (severity.props ?? "error"),
    ancestorSeverity:
      typeof severity === "string" ? severity : (severity.ancestor ?? "error"),
  };
}

function makeContracts(
  slots: ContainerConfig[],
  subtree: NoDescendantsConfig[],
  props: PropsConfig[],
  ancestor: AncestorConfig[],
): CompiledContracts {
  return {
    slots,
    subtree,
    props,
    ancestor,
    rules(
      severity: SeverityChoice = "error",
    ): ReturnType<CompiledContracts["rules"]> {
      const {
        slotsSeverity,
        subtreeSeverity,
        propsSeverity,
        ancestorSeverity,
      } = facetSeverities(severity);

      // The variants of a facet all take the full payload; the rules intern
      // it by content, so the per-file analysis runs once across them.
      return {
        "@jsx-contracts/slots.children": [slotsSeverity, slots],
        "@jsx-contracts/slots.count": [slotsSeverity, slots],
        "@jsx-contracts/slots.placement": [slotsSeverity, slots],
        "@jsx-contracts/slots.requires": [slotsSeverity, slots],
        "@jsx-contracts/slots.exclusive": [slotsSeverity, slots],
        "@jsx-contracts/slots.strict": [slotsSeverity, slots],
        "@jsx-contracts/subtree.forbid": [subtreeSeverity, subtree],
        "@jsx-contracts/subtree.forbidProps": [subtreeSeverity, subtree],
        "@jsx-contracts/subtree.count": [subtreeSeverity, subtree],
        "@jsx-contracts/props.required": [propsSeverity, props],
        "@jsx-contracts/props.exclusive": [propsSeverity, props],
        "@jsx-contracts/props.deprecated": [propsSeverity, props],
        "@jsx-contracts/ancestor.forbid": [ancestorSeverity, ancestor],
      };
    },
  };
}

/**
 * Merge any number of contracts — from `defineContracts`, a `contract()`
 * builder, or other `mergeContracts` calls — into one. The result is itself a
 * contract, so merges nest; call `rules()` once at the end, in your ESLint
 * config.
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
    contracts.flatMap((entry) => entry.props),
    contracts.flatMap((entry) => entry.ancestor),
  );
}

// -- fluent builder (`contract`) ----------------------------------------------

/**
 * A subtree ban mid-authoring: it must forbid at least one element or prop
 * before the chain can continue with anything else.
 */
export interface PendingBan<SlotKey extends string> {
  /** Elements barred anywhere below the activated component. */
  forbid(...elements: [Forbid, ...Forbid[]]): BanBuilder<SlotKey>;
  /** Props barred on every element below the activated component. */
  forbidProps(...props: [string, ...string[]]): BanBuilder<SlotKey>;
}

/**
 * A builder whose latest `when` ban can still take more forbids; any other
 * call closes the ban.
 */
export type BanBuilder<SlotKey extends string> = ContractBuilder<SlotKey> &
  PendingBan<SlotKey>;

/**
 * One component's contract, built fluently. A builder is already a
 * `CompiledContracts`: call `rules()` on it directly, or combine several with
 * `mergeContracts`. Every call returns a new builder — earlier references
 * stay unchanged.
 *
 * @example
 * const tray = contract("Widget.Tray", "@acme/ds")
 *   .hasSlots({ ".Title": { count: { min: 1 } }, ".Action": true })
 *   .requires(".Action", ".Title")
 *   .strict();
 */
export interface ContractBuilder<
  SlotKey extends string,
> extends CompiledContracts {
  /**
   * Declare slots; later `requires`/`exclusive` references are type-checked
   * against the keys declared so far. A key starting with `.` is shorthand
   * for `<Component><key>`.
   */
  hasSlots<const S extends Record<string, SlotSpec>>(
    slots: S,
  ): ContractBuilder<SlotKey | Extract<keyof S, string>>;
  /** The `slot` may only render alongside `requiredSlot`. */
  requires(slot: SlotKey, requiredSlot: SlotKey): ContractBuilder<SlotKey>;
  /** The two slot groups may not co-render. */
  exclusive(
    groupA: [SlotKey, ...SlotKey[]],
    groupB: [SlotKey, ...SlotKey[]],
  ): ContractBuilder<SlotKey>;
  /** Report unresolvable children as violations; presence checks always run. */
  strict(): ContractBuilder<SlotKey>;
  /**
   * Require descendants anywhere below the component, with count bounds — for
   * parts that may sit under wrapper elements the direct-child slots facet
   * can't see. A key starting with `.` is shorthand for `<Component><key>`;
   * `true` = default bounds (at most one).
   *
   * @example
   * .hasDescendants({ ".List": { count: { min: 1, max: 1 } }, ".Panel": true })
   */
  hasDescendants(
    descendants: Record<string, SlotSpec>,
  ): ContractBuilder<SlotKey>;
  /**
   * Start a subtree ban activated by `prop` — on presence, or only when its
   * value is one of `is`. At most one ban per prop.
   *
   * @example
   * .when("variant", ["compact"]).forbid("Widget.Footer")
   */
  when(prop: string, is?: [Literal, ...Literal[]]): PendingBan<SlotKey>;
  /** Require `prop` to be present on the component's element. */
  requiresProp(prop: string): ContractBuilder<SlotKey>;
  /** Require at least one of `props` to be present on the element. */
  requiresOneOf(
    ...props: [string, string, ...string[]]
  ): ContractBuilder<SlotKey>;
  /** Forbid the two prop groups from co-occurring on the element. */
  exclusiveProps(
    groupA: [string, ...string[]],
    groupB: [string, ...string[]],
  ): ContractBuilder<SlotKey>;
  /** Deprecate `prop`, optionally hinting the prop to use instead. */
  deprecatesProp(prop: string, useInstead?: string): ContractBuilder<SlotKey>;
  /** Deprecate the component itself, optionally hinting a replacement. */
  deprecated(useInstead?: string): ContractBuilder<SlotKey>;
  /**
   * Forbid this component from rendering anywhere below the given ancestors —
   * no `<Button>` inside a `<Button>`. A bare string matches by name only; an
   * object gates the ancestor by its `from` import. Calling it again appends;
   * naming an already-forbidden ancestor throws.
   *
   * @example
   * .notInside("Button", { name: "Link", from: "@acme/ds" })
   */
  notInside(...elements: [Forbid, ...Forbid[]]): ContractBuilder<SlotKey>;
}

/**
 * Start a fluent contract for one component. The type-state enforces order:
 * slots must be declared before `requires`/`exclusive` can reference them,
 * and a `when` ban must forbid something before the chain continues.
 *
 * @example
 * export const tray = contract("Widget.Tray", "@acme/ds")
 *   .hasSlots({ ".Title": { count: { min: 1, max: 1 } }, ".Overflow": true, ".Action": true })
 *   .requires(".Action", ".Title")
 *   .exclusive([".Overflow"], [".Action"])
 *   .when("variant", ["compact"]).forbid("Widget.Footer");
 * // eslint.config.js → rules: mergeContracts(tray, ...).rules()
 */
export function contract(
  component: string,
  from: Gate,
): ContractBuilder<never> {
  // The impl works with plain string slot keys; the generic facets narrow it.
  return makeBuilder(component, { from });
}

function makeBuilder(
  component: string,
  entry: RuntimeEntry,
  banProp?: string,
): BanBuilder<string> {
  // Builders are immutable, so the compilation is computed once and reused by
  // every payload access (`slots`, `subtree`, `rules()`, …).
  let compiled: CompiledContracts | undefined;

  const finalize = (): CompiledContracts =>
    (compiled ??= compile({ [component]: entry }, undefined));

  const requireDeclared = (reference: string): void => {
    if (entry.slots?.[reference] === undefined) {
      throw new Error(
        `contract: component "${component}" references slot "${reference}" ` +
          "before declaring it in hasSlots().",
      );
    }
  };

  // The ban this builder may still extend; absent outside a `when` chain.
  const activeBan = (): { prop: string; ban: RuntimeBan } => {
    const ban = banProp === undefined ? undefined : entry.subtree?.[banProp];

    if (banProp === undefined || ban === undefined) {
      throw new Error(
        `contract: component "${component}" has no active subtree ban — ` +
          "start one with when().",
      );
    }

    return { prop: banProp, ban };
  };

  const withBan = (prop: string, ban: RuntimeBan): RuntimeEntry => ({
    ...entry,
    subtree: { ...entry.subtree, [prop]: ban },
  });

  const currentProps = (): RuntimeProps => entry.props ?? {};

  const withProps = (next: RuntimeProps): RuntimeEntry => ({
    ...entry,
    props: next,
  });

  return {
    hasSlots(slots): BanBuilder<string> {
      for (const key of Object.keys(slots)) {
        if (entry.slots?.[key] !== undefined) {
          throw new Error(
            `contract: component "${component}" declares slot "${key}" twice.`,
          );
        }
      }

      return makeBuilder(component, {
        ...entry,
        slots: { ...entry.slots, ...slots },
      });
    },
    requires(slot, requiredSlot): BanBuilder<string> {
      requireDeclared(slot);
      requireDeclared(requiredSlot);

      if (entry.requires?.[slot] !== undefined) {
        throw new Error(
          `contract: component "${component}" already has a requires for ` +
            `slot "${slot}".`,
        );
      }

      return makeBuilder(component, {
        ...entry,
        requires: { ...entry.requires, [slot]: requiredSlot },
      });
    },
    exclusive(groupA, groupB): BanBuilder<string> {
      for (const member of [...groupA, ...groupB]) {
        requireDeclared(member);
      }

      return makeBuilder(component, {
        ...entry,
        exclusive: [...(entry.exclusive ?? []), [groupA, groupB]],
      });
    },
    strict(): BanBuilder<string> {
      return makeBuilder(component, { ...entry, strict: true });
    },
    hasDescendants(descendants): BanBuilder<string> {
      for (const key of Object.keys(descendants)) {
        if (entry.descendants?.[key] !== undefined) {
          throw new Error(
            `contract: component "${component}" declares descendant "${key}" twice.`,
          );
        }
      }

      return makeBuilder(component, {
        ...entry,
        descendants: { ...entry.descendants, ...descendants },
      });
    },
    when(prop, is): PendingBan<string> {
      if (entry.subtree?.[prop] !== undefined) {
        throw new Error(
          `contract: component "${component}" already has a subtree ban on ` +
            `prop "${prop}".`,
        );
      }

      const base: RuntimeBan = is === undefined ? {} : { is };

      return {
        forbid: (...elements) =>
          makeBuilder(
            component,
            withBan(prop, { ...base, forbid: elements }),
            prop,
          ),
        forbidProps: (...props) =>
          makeBuilder(
            component,
            withBan(prop, { ...base, forbidProps: props }),
            prop,
          ),
      };
    },
    // These extend the ban `when` opened; the typed facets only surface them
    // on a BanBuilder.
    forbid(...elements): BanBuilder<string> {
      const { prop, ban } = activeBan();

      return makeBuilder(
        component,
        withBan(prop, { ...ban, forbid: [...(ban.forbid ?? []), ...elements] }),
        prop,
      );
    },
    forbidProps(...props): BanBuilder<string> {
      const { prop, ban } = activeBan();

      return makeBuilder(
        component,
        withBan(prop, {
          ...ban,
          forbidProps: [...(ban.forbidProps ?? []), ...props],
        }),
        prop,
      );
    },
    // The prop-facet methods reference no slot keys, so they close any active
    // ban and stay available at every chain state.
    requiresProp(prop): BanBuilder<string> {
      const props = currentProps();

      return makeBuilder(
        component,
        withProps({ ...props, required: [...(props.required ?? []), prop] }),
      );
    },
    requiresOneOf(...group): BanBuilder<string> {
      const props = currentProps();

      return makeBuilder(
        component,
        withProps({ ...props, required: [...(props.required ?? []), group] }),
      );
    },
    exclusiveProps(groupA, groupB): BanBuilder<string> {
      const props = currentProps();

      return makeBuilder(
        component,
        withProps({
          ...props,
          exclusive: [...(props.exclusive ?? []), [groupA, groupB]],
        }),
      );
    },
    deprecatesProp(prop, useInstead): BanBuilder<string> {
      const props = currentProps();

      if (props.deprecated?.[prop] !== undefined) {
        throw new Error(
          `contract: component "${component}" already deprecates prop ` +
            `"${prop}".`,
        );
      }

      return makeBuilder(
        component,
        withProps({
          ...props,
          deprecated: { ...props.deprecated, [prop]: useInstead ?? true },
        }),
      );
    },
    deprecated(useInstead): BanBuilder<string> {
      if (entry.deprecated !== undefined) {
        throw new Error(
          `contract: component "${component}" is already deprecated.`,
        );
      }

      return makeBuilder(component, {
        ...entry,
        deprecated: useInstead ?? true,
      });
    },
    // References no slot keys, so it closes any active ban and stays available
    // at every chain state, like the prop-facet methods.
    notInside(...elements): BanBuilder<string> {
      const existing = entry.notInside ?? [];
      const seen = new Set(
        existing.map((el) => (typeof el === "string" ? el : el.name)),
      );

      for (const element of elements) {
        const name = typeof element === "string" ? element : element.name;

        if (seen.has(name)) {
          throw new Error(
            `contract: component "${component}" already forbids ancestor ` +
              `"${name}".`,
          );
        }

        seen.add(name);
      }

      return makeBuilder(component, {
        ...entry,
        notInside: [...existing, ...elements],
      });
    },
    get slots(): ContainerConfig[] {
      return finalize().slots;
    },
    get subtree(): NoDescendantsConfig[] {
      return finalize().subtree;
    },
    get props(): PropsConfig[] {
      return finalize().props;
    },
    get ancestor(): AncestorConfig[] {
      return finalize().ancestor;
    },
    rules(severity): ReturnType<CompiledContracts["rules"]> {
      return finalize().rules(severity);
    },
  };
}
