import type { ContractRows } from "@jsx-contracts/eslint-plugin";

import type {
  Forbid,
  Gate,
  RuntimeConditional,
  RuntimeEntry,
  RuntimeProps,
  RuntimeSlotSpec,
} from "./compile.js";
import { compile } from "./compile.js";
import type { Binding, PartName, PartNames } from "./component-names.js";
import type { Condition } from "./condition.js";
import type { CompiledContracts } from "./rule-table.js";

/**
 * What a chain state yields once the methods below have run. A named contract
 * carries the payload accessors; a nameless one does not, because it has no
 * component to compile against — `when` is the only thing that can use it.
 */
type Builder<
  SlotKey extends string,
  Bound extends Binding,
  Named extends boolean,
> = Named extends true ? ContractBuilder<SlotKey, Bound> : Fragment<SlotKey>;

/**
 * Count bounds for the slot or descendant just declared. Offered by the
 * type-state only directly after the declaration they bound — and after each
 * other, so `.atLeast(1).atMost(1)` reads — so a bound cannot silently attach
 * to the wrong part.
 */
export interface PendingCount<
  SlotKey extends string,
  Bound extends Binding = Binding,
  Named extends boolean = true,
> {
  /** The part must appear at least `count` times; the upper bound goes unbounded. */
  atLeast(count: number): SlotBuilder<SlotKey, Bound, Named>;
  /** The part may appear at most `count` times; the lower bound stays nought. */
  atMost(count: number): SlotBuilder<SlotKey, Bound, Named>;
}

/**
 * A builder whose latest slot or descendant declaration can still take count
 * bounds; any other call closes the declaration.
 */
export type SlotBuilder<
  SlotKey extends string,
  Bound extends Binding = Binding,
  Named extends boolean = true,
> = Builder<SlotKey, Bound, Named> & PendingCount<SlotKey, Bound, Named>;

/**
 * Every method a contract offers, named or nameless. The two differ only in
 * what they yield: `ContractBuilder` adds the payload accessors, `Fragment`
 * adds nothing.
 */
export interface ContractMethods<
  SlotKey extends string,
  Bound extends Binding,
  Named extends boolean,
> {
  /**
   * Declare one slot — a component allowed as a direct child. A name starting
   * with `.` is shorthand for `<Component><name>`: the module's parts under the
   * component are offered as completions, and the expansion is checked against
   * its export paths — accepted unchecked where the module resolves nothing
   * that deep. On a nameless contract the expansion happens where `when`
   * attaches it, so one value can gate several components. `from` is the slot's
   * own import gate, for a part sourced from a different package than its
   * container; omitted, the slot inherits the container's gate. Later
   * `slotRequires`/`exclusiveSlots` references are type-checked against the
   * names declared so far. Declaring a slot twice throws.
   *
   * The count bounds that follow apply to this slot alone and are offered by
   * the type-state only here: a bare declaration allows nought or one.
   *
   * @example
   * .hasSlot(".Title").atLeast(1).atMost(1)
   * .hasSlot("Other.Badge", "@other/pkg")
   */
  hasSlot<const Name extends PartNames<Bound>>(
    name: Name & PartName<Name, Bound>,
    from?: Gate,
  ): SlotBuilder<SlotKey | Name, Bound, Named>;
  /** The `slot` may only render alongside `requiredSlot`. */
  slotRequires(
    slot: SlotKey,
    requiredSlot: SlotKey,
  ): Builder<SlotKey, Bound, Named>;
  /** The two slot groups may not co-render. */
  exclusiveSlots(
    groupA: [SlotKey, ...SlotKey[]],
    groupB: [SlotKey, ...SlotKey[]],
  ): Builder<SlotKey, Bound, Named>;
  /** Report unresolvable children as violations; presence checks always run. */
  strictSlots(): Builder<SlotKey, Bound, Named>;
  /**
   * Require one descendant anywhere below the component — for a part that may
   * sit under wrapper elements the direct-child slots facet can't see. A name
   * starting with `.` is shorthand for `<Component><name>`, checked against the
   * bound module like a slot's; `from` is the descendant's own import gate.
   * Declaring a descendant twice throws.
   *
   * The count bounds that follow apply to this descendant alone, with the same
   * defaults as a slot's.
   *
   * @example
   * .hasDescendant(".List").atLeast(1)
   */
  hasDescendant<const Name extends PartNames<Bound>>(
    name: Name & PartName<Name, Bound>,
    from?: Gate,
  ): SlotBuilder<SlotKey, Bound, Named>;
  /**
   * Bar elements from appearing anywhere below the component. Calling it again
   * appends.
   *
   * @example
   * .forbidDescendants("Widget.Modal", { name: "Legacy", from: "@acme/old" })
   */
  forbidDescendants(
    ...elements: [Forbid, ...Forbid[]]
  ): Builder<SlotKey, Bound, Named>;
  /** Bar these props from every element below the component. */
  forbidDescendantProps(
    ...props: [string, ...string[]]
  ): Builder<SlotKey, Bound, Named>;
  /** Require `prop` to be present on the component's element. */
  requiresProp(prop: string): Builder<SlotKey, Bound, Named>;
  /** Require at least one of `props` to be present on the element. */
  requiresAnyProp(
    ...props: [string, string, ...string[]]
  ): Builder<SlotKey, Bound, Named>;
  /** Forbid the two prop groups from co-occurring on the element. */
  exclusiveProps(
    groupA: [string, ...string[]],
    groupB: [string, ...string[]],
  ): Builder<SlotKey, Bound, Named>;
  /** Deprecate `prop`, optionally hinting the prop to use instead. */
  deprecatesProp(
    prop: string,
    useInstead?: string,
  ): Builder<SlotKey, Bound, Named>;
  /** Deprecate the component itself, optionally hinting a replacement. */
  deprecated(useInstead?: string): Builder<SlotKey, Bound, Named>;
  /**
   * Forbid this component from rendering anywhere below the given ancestors —
   * no `<Button>` inside a `<Button>`. A bare string matches by name only; an
   * object gates the ancestor by its `from` import. Calling it again appends;
   * naming an already-forbidden ancestor throws.
   *
   * @example
   * .notInside("Button", { name: "Link", from: "@acme/ds" })
   */
  notInside(...elements: [Forbid, ...Forbid[]]): Builder<SlotKey, Bound, Named>;
  /**
   * Apply a nameless contract's rules only while `condition` holds. Both
   * arguments are values, so a recurring condition — or a recurring set of
   * rules — is written once and shared across components.
   *
   * Conditional rules **accumulate**; they do not replace. A conditional slot
   * list intersects with the base one, narrowing what is allowed while the
   * condition holds. To widen instead, omit the unconditional row and make
   * every row conditional and mutually exclusive, at the cost documented on
   * `not`: a spread then leaves the facet unchecked entirely.
   *
   * A `when` nested inside the nameless contract conjoins its condition with
   * this one.
   *
   * @example
   * contract("Button")
   *   .requiresProp("label")
   *   .when(prop("as").is("a"), contract().requiresProp("href"))
   *   .when(prop("as").is("button"), contract().requiresProp("onClick"));
   */
  when(
    condition: Condition,
    rules: Fragment<string>,
  ): Builder<SlotKey, Bound, Named>;
}

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
 *   .slotRequires(".Action", ".Title")
 *   .strictSlots();
 */
export interface ContractBuilder<
  SlotKey extends string,
  Bound extends Binding = Binding,
>
  extends ContractMethods<SlotKey, Bound, true>, CompiledContracts {}

/**
 * A nameless contract: every builder method, no component, and so no payload of
 * its own. `when` is what gives it one — it attaches the rules to a component,
 * expands their shorthand names against it, and gates them on a condition. The
 * term appears only in the types; the API has no separate constructor for it.
 *
 * Part names go unchecked against a module here, because which component the
 * rules land on is not known until `when` attaches them.
 *
 * @example
 * const noImage = contract().forbidDescendants("Card.Image");
 * const card = contract("Card")
 *   .when(compact, noImage)
 *   .when(prop("inline").isPresent(), noImage);
 */
export type Fragment<SlotKey extends string = never> = ContractMethods<
  SlotKey,
  Binding,
  false
>;

/**
 * Start a fluent contract. Internal: consumers reach one by destructuring
 * `contract` off a `contractsFor` binding, which supplies `from` — the gate is
 * stated once for the whole design system rather than repeated per component.
 * Called with no name it builds a nameless contract instead, for `when`.
 *
 * The type-state enforces order: slots must be declared before
 * `slotRequires`/`exclusiveSlots` can reference them, and count bounds are
 * offered only directly after the declaration they bound. The binding travels
 * with a named builder — the design-system module, and the component's own name
 * captured as a literal — so shorthand part names can be checked against the
 * module's export paths.
 *
 * @example
 * const { contract, prop } = contractsFor<typeof import("@acme/ds")>("@acme/ds");
 * export const tray = contract("Widget.Tray")
 *   .hasSlot(".Title").atLeast(1).atMost(1)
 *   .hasSlot(".Action")
 *   .slotRequires(".Action", ".Title")
 *   .when(
 *     prop("variant").is("compact"),
 *     contract().forbidDescendants("Widget.Footer"),
 *   );
 * // eslint.config.js → rules: mergeContracts(tray, ...).rules()
 */
export function contract(): Fragment;
export function contract<Bound extends Binding = Binding>(
  component: Bound["component"],
  from: Gate,
): ContractBuilder<never, Bound>;
export function contract(component?: string, from?: Gate): AnyBuilder {
  return makeBuilder(component, component === undefined ? {} : { from });
}

interface AnyBuilder extends CompiledContracts {
  hasSlot: (name: string, from?: Gate) => AnyBuilder;
  atLeast: (count: number) => AnyBuilder;
  atMost: (count: number) => AnyBuilder;
  slotRequires: (slot: string, requiredSlot: string) => AnyBuilder;
  exclusiveSlots: (groupA: string[], groupB: string[]) => AnyBuilder;
  strictSlots: () => AnyBuilder;
  hasDescendant: (name: string, from?: Gate) => AnyBuilder;
  forbidDescendants: (...elements: Forbid[]) => AnyBuilder;
  forbidDescendantProps: (...props: string[]) => AnyBuilder;
  requiresProp: (prop: string) => AnyBuilder;
  requiresAnyProp: (...props: string[]) => AnyBuilder;
  exclusiveProps: (groupA: string[], groupB: string[]) => AnyBuilder;
  deprecatesProp: (prop: string, useInstead?: string) => AnyBuilder;
  deprecated: (useInstead?: string) => AnyBuilder;
  notInside: (...elements: Forbid[]) => AnyBuilder;
  when: (condition: Condition | undefined, rules: object) => AnyBuilder;
}

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

// Keyed off the builder object so `when` can read a nameless contract's rules.
const namelessEntries = new WeakMap<object, RuntimeEntry>();

function makeBuilder(
  component: string | undefined,
  entry: RuntimeEntry,
  pendingPart?: PendingPart,
): AnyBuilder {
  let compiled: CompiledContracts | undefined;

  const subject =
    component === undefined ? "nameless contract" : `component "${component}"`;

  const finalize = (): CompiledContracts => {
    if (component === undefined) {
      throw new Error(
        "contract: a nameless contract has no rule table of its own — " +
          "attach it to a component with when().",
      );
    }

    return (compiled ??= compile({ [component]: entry }));
  };

  const next = (updated: RuntimeEntry, part?: PendingPart): AnyBuilder =>
    makeBuilder(component, updated, part);

  const requireDeclared = (reference: string): void => {
    if (entry.slots?.[reference] === undefined) {
      throw new Error(
        `contract: ${subject} references slot "${reference}" before ` +
          "declaring it in hasSlot().",
      );
    }
  };

  const withPart = (
    kind: PartKind,
    name: string,
    spec: RuntimeSlotSpec,
  ): RuntimeEntry => ({
    ...entry,
    [partsKey[kind]]: { ...entry[partsKey[kind]], [name]: spec },
  });

  const declarePart = (
    kind: PartKind,
    name: string,
    from: Gate | undefined,
  ): AnyBuilder => {
    if (entry[partsKey[kind]]?.[name] !== undefined) {
      throw new Error(`contract: ${subject} declares ${kind} "${name}" twice.`);
    }

    const spec: RuntimeSlotSpec = from === undefined ? {} : { from };

    return next(withPart(kind, name, spec), { kind, name });
  };

  const boundPart = (bound: "min" | "max", count: number): AnyBuilder => {
    if (pendingPart === undefined) {
      throw new Error(
        `contract: ${subject} has no slot or descendant to bound — declare ` +
          "one with hasSlot() or hasDescendant().",
      );
    }

    const { kind, name } = pendingPart;
    const spec: RuntimeSlotSpec = entry[partsKey[kind]]?.[name] ?? {};

    return next(
      withPart(kind, name, {
        ...spec,
        count: { ...spec.count, [bound]: count },
      }),
      pendingPart,
    );
  };

  const currentProps = (): RuntimeProps => entry.props ?? {};

  const withProps = (updated: RuntimeProps): AnyBuilder =>
    next({ ...entry, props: updated });

  const builder: AnyBuilder = {
    hasSlot(name, from): AnyBuilder {
      return declarePart("slot", name, from);
    },
    atLeast(count): AnyBuilder {
      return boundPart("min", count);
    },
    atMost(count): AnyBuilder {
      return boundPart("max", count);
    },
    slotRequires(slot, requiredSlot): AnyBuilder {
      requireDeclared(slot);
      requireDeclared(requiredSlot);

      if (entry.requires?.[slot] !== undefined) {
        throw new Error(
          `contract: ${subject} already has a slotRequires() for slot ` +
            `"${slot}".`,
        );
      }

      return next({
        ...entry,
        requires: { ...entry.requires, [slot]: requiredSlot },
      });
    },
    exclusiveSlots(groupA, groupB): AnyBuilder {
      for (const member of [...groupA, ...groupB]) {
        requireDeclared(member);
      }

      return next({
        ...entry,
        exclusive: [...(entry.exclusive ?? []), [groupA, groupB]],
      });
    },
    strictSlots(): AnyBuilder {
      return next({ ...entry, strict: true });
    },
    hasDescendant(name, from): AnyBuilder {
      return declarePart("descendant", name, from);
    },
    forbidDescendants(...elements): AnyBuilder {
      return next({ ...entry, forbid: [...(entry.forbid ?? []), ...elements] });
    },
    forbidDescendantProps(...props): AnyBuilder {
      return next({
        ...entry,
        forbidProps: [...(entry.forbidProps ?? []), ...props],
      });
    },
    requiresProp(prop): AnyBuilder {
      const props = currentProps();

      return withProps({
        ...props,
        required: [...(props.required ?? []), prop],
      });
    },
    requiresAnyProp(...group): AnyBuilder {
      const props = currentProps();

      return withProps({
        ...props,
        required: [...(props.required ?? []), group],
      });
    },
    exclusiveProps(groupA, groupB): AnyBuilder {
      const props = currentProps();

      return withProps({
        ...props,
        exclusive: [...(props.exclusive ?? []), [groupA, groupB]],
      });
    },
    deprecatesProp(prop, useInstead): AnyBuilder {
      const props = currentProps();

      if (props.deprecated?.[prop] !== undefined) {
        throw new Error(
          `contract: ${subject} already deprecates prop "${prop}".`,
        );
      }

      return withProps({
        ...props,
        deprecated: { ...props.deprecated, [prop]: useInstead ?? true },
      });
    },
    deprecated(useInstead): AnyBuilder {
      if (entry.deprecated !== undefined) {
        throw new Error(`contract: ${subject} is already deprecated.`);
      }

      return next({ ...entry, deprecated: useInstead ?? true });
    },
    notInside(...elements): AnyBuilder {
      const existing = entry.notInside ?? [];
      const seen = new Set(
        existing.map((el) => (typeof el === "string" ? el : el.name)),
      );

      for (const element of elements) {
        const name = typeof element === "string" ? element : element.name;

        if (seen.has(name)) {
          throw new Error(
            `contract: ${subject} already forbids ancestor "${name}".`,
          );
        }

        seen.add(name);
      }

      return next({ ...entry, notInside: [...existing, ...elements] });
    },
    when(condition, rules): AnyBuilder {
      const gated = namelessEntries.get(rules);

      if (gated === undefined) {
        throw new Error(
          `contract: ${subject} calls when() with something other than a ` +
            "nameless contract from contract().",
        );
      }

      if (condition?.when === undefined) {
        throw new Error(
          `contract: ${subject} calls when() with something other than a ` +
            "condition from prop()/allOf()/anyOf()/not().",
        );
      }

      const conditional: RuntimeConditional = {
        when: condition.when,
        rules: gated,
      };

      return next({
        ...entry,
        conditional: [...(entry.conditional ?? []), conditional],
      });
    },
    get rows(): ContractRows {
      return finalize().rows;
    },
    rules(severity): ReturnType<CompiledContracts["rules"]> {
      return finalize().rules(severity);
    },
  };

  if (component === undefined) {
    namelessEntries.set(builder, entry);
  }

  return builder;
}
