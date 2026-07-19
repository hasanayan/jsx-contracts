// The fluent builder surface: one component's contract, built by chaining. A
// builder is already a compiled contract — it accumulates a runtime entry and
// hands it to `compile` on first payload access.

import type { ContractRows } from "@jsx-contracts/eslint-plugin";

import type {
  RuntimeBan,
  RuntimeEntry,
  RuntimeProps,
  RuntimeSlotSpec,
} from "./compile.js";
import { compile } from "./compile.js";
import type { Forbid, Gate, Literal } from "./contract-entry.js";
import type { CompiledContracts } from "./rule-table.js";

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
 * Count bounds for the slot or descendant just declared. Offered by the
 * type-state only directly after the declaration they bound — and after each
 * other, so `.atLeast(1).atMost(1)` reads — so a bound cannot silently attach
 * to the wrong part.
 */
export interface PendingCount<SlotKey extends string> {
  /** The part must appear at least `count` times; the upper bound goes unbounded. */
  atLeast(count: number): SlotBuilder<SlotKey>;
  /** The part may appear at most `count` times; the lower bound stays nought. */
  atMost(count: number): SlotBuilder<SlotKey>;
}

/**
 * A builder whose latest slot or descendant declaration can still take count
 * bounds; any other call closes the declaration.
 */
export type SlotBuilder<SlotKey extends string> = ContractBuilder<SlotKey> &
  PendingCount<SlotKey>;

/**
 * One component's contract, built fluently. A builder is already a
 * `CompiledContracts`: call `rules()` on it directly, or combine several with
 * `mergeContracts`. Every call returns a new builder — earlier references
 * stay unchanged.
 *
 * @example
 * const tray = contract("Widget.Tray")
 *   .hasSlot(".Title").atLeast(1)
 *   .hasSlot(".Action")
 *   .requires(".Action", ".Title")
 *   .strict();
 */
export interface ContractBuilder<
  SlotKey extends string,
> extends CompiledContracts {
  /**
   * Declare one slot — a component allowed as a direct child. A name starting
   * with `.` is shorthand for `<Component><name>`. `from` is the slot's own
   * import gate, for a part sourced from a different package than its
   * container; omitted, the slot inherits the container's gate. Later
   * `requires`/`exclusive` references are type-checked against the names
   * declared so far. Declaring a slot twice throws.
   *
   * The count bounds that follow apply to this slot alone and are offered by
   * the type-state only here: a bare declaration allows nought or one.
   *
   * @example
   * .hasSlot(".Title").atLeast(1).atMost(1)
   * .hasSlot("Other.Badge", "@other/pkg")
   */
  hasSlot<const Name extends string>(
    name: Name,
    from?: Gate,
  ): SlotBuilder<SlotKey | Name>;
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
   * Require one descendant anywhere below the component — for a part that may
   * sit under wrapper elements the direct-child slots facet can't see. A name
   * starting with `.` is shorthand for `<Component><name>`; `from` is the
   * descendant's own import gate. Declaring a descendant twice throws.
   *
   * The count bounds that follow apply to this descendant alone, with the same
   * defaults as a slot's.
   *
   * @example
   * .hasDescendant(".List").atLeast(1)
   */
  hasDescendant(name: string, from?: Gate): SlotBuilder<SlotKey>;
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
 * Start a fluent contract for one component. Internal: consumers reach a
 * builder by destructuring `contract` off a `contractsFor` binding, which
 * supplies `from` — the gate is stated once for the whole design system rather
 * than repeated per component. The type-state enforces order: slots must be
 * declared before `requires`/`exclusive` can reference them, count bounds are
 * offered only directly after the declaration they bound, and a `when` ban must
 * forbid something before the chain continues.
 *
 * @example
 * const { contract } = contractsFor<typeof import("@acme/ds")>("@acme/ds");
 * export const tray = contract("Widget.Tray")
 *   .hasSlot(".Title").atLeast(1).atMost(1)
 *   .hasSlot(".Overflow")
 *   .hasSlot(".Action")
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

// The untyped view of a builder: every method the surface can offer, before the
// type-state hides the ones the chain state does not reach.
type AnyBuilder = BanBuilder<string> & PendingCount<string>;

// The slot or descendant a count bound would attach to; absent once anything
// else is chained.
/**
 * Which kind of part a declaration names. A slot is the children facet's unit
 * and a descendant the subtree facet's, but both are declared and bounded the
 * same way, so the builder carries the kind rather than the facet.
 */
type PartKind = "slot" | "descendant";

/** Where a kind's parts live on the runtime entry. */
const partsKey = {
  slot: "slots",
  descendant: "descendants",
} as const satisfies Record<PartKind, keyof RuntimeEntry>;

interface PendingPart {
  readonly kind: PartKind;
  readonly name: string;
}

function makeBuilder(
  component: string,
  entry: RuntimeEntry,
  banProp?: string,
  pendingPart?: PendingPart,
): AnyBuilder {
  // Builders are immutable, so the compilation is computed once and reused by
  // every payload access (`slots`, `subtree`, `rules()`, …).
  let compiled: CompiledContracts | undefined;

  const finalize = (): CompiledContracts =>
    (compiled ??= compile({ [component]: entry }, undefined));

  const requireDeclared = (reference: string): void => {
    if (entry.slots?.[reference] === undefined) {
      throw new Error(
        `contract: component "${component}" references slot "${reference}" ` +
          "before declaring it in hasSlot().",
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

  const withPart = (
    kind: PartKind,
    name: string,
    spec: RuntimeSlotSpec,
  ): RuntimeEntry => ({
    ...entry,
    [partsKey[kind]]: { ...entry[partsKey[kind]], [name]: spec },
  });

  // One part declared into `slots` or `descendants`, refusing a name the
  // component already declares as that kind.
  const declarePart = (
    kind: PartKind,
    name: string,
    from: Gate | undefined,
  ): AnyBuilder => {
    if (entry[partsKey[kind]]?.[name] !== undefined) {
      throw new Error(
        `contract: component "${component}" declares ${kind} "${name}" twice.`,
      );
    }

    const spec: RuntimeSlotSpec = from === undefined ? {} : { from };

    return makeBuilder(component, withPart(kind, name, spec), undefined, {
      kind,
      name,
    });
  };

  // A count bound on the part just declared. The type-state only surfaces
  // `atLeast`/`atMost` there, so the throw is for untyped callers.
  const boundPart = (bound: "min" | "max", count: number): AnyBuilder => {
    if (pendingPart === undefined) {
      throw new Error(
        `contract: component "${component}" has no slot or descendant to ` +
          "bound — declare one with hasSlot() or hasDescendant().",
      );
    }

    const { kind, name } = pendingPart;
    // A pending part was written by `declarePart`, so it is always an object
    // spec; the `true` shorthand only reaches an entry through the map form.
    const declared = entry[partsKey[kind]]?.[name];
    const spec: RuntimeSlotSpec =
      declared === undefined || declared === true ? {} : declared;

    return makeBuilder(
      component,
      withPart(kind, name, {
        ...spec,
        count: { ...spec.count, [bound]: count },
      }),
      undefined,
      pendingPart,
    );
  };

  const currentProps = (): RuntimeProps => entry.props ?? {};

  const withProps = (next: RuntimeProps): RuntimeEntry => ({
    ...entry,
    props: next,
  });

  return {
    hasSlot(name, from): AnyBuilder {
      return declarePart("slot", name, from);
    },
    atLeast(count): AnyBuilder {
      return boundPart("min", count);
    },
    atMost(count): AnyBuilder {
      return boundPart("max", count);
    },
    requires(slot, requiredSlot): AnyBuilder {
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
    exclusive(groupA, groupB): AnyBuilder {
      for (const member of [...groupA, ...groupB]) {
        requireDeclared(member);
      }

      return makeBuilder(component, {
        ...entry,
        exclusive: [...(entry.exclusive ?? []), [groupA, groupB]],
      });
    },
    strict(): AnyBuilder {
      return makeBuilder(component, { ...entry, strict: true });
    },
    hasDescendant(name, from): AnyBuilder {
      return declarePart("descendant", name, from);
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
    forbid(...elements): AnyBuilder {
      const { prop, ban } = activeBan();

      return makeBuilder(
        component,
        withBan(prop, { ...ban, forbid: [...(ban.forbid ?? []), ...elements] }),
        prop,
      );
    },
    forbidProps(...props): AnyBuilder {
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
    requiresProp(prop): AnyBuilder {
      const props = currentProps();

      return makeBuilder(
        component,
        withProps({ ...props, required: [...(props.required ?? []), prop] }),
      );
    },
    requiresOneOf(...group): AnyBuilder {
      const props = currentProps();

      return makeBuilder(
        component,
        withProps({ ...props, required: [...(props.required ?? []), group] }),
      );
    },
    exclusiveProps(groupA, groupB): AnyBuilder {
      const props = currentProps();

      return makeBuilder(
        component,
        withProps({
          ...props,
          exclusive: [...(props.exclusive ?? []), [groupA, groupB]],
        }),
      );
    },
    deprecatesProp(prop, useInstead): AnyBuilder {
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
    deprecated(useInstead): AnyBuilder {
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
    notInside(...elements): AnyBuilder {
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
    get rows(): ContractRows {
      return finalize().rows;
    },
    rules(severity): ReturnType<CompiledContracts["rules"]> {
      return finalize().rules(severity);
    },
  };
}
