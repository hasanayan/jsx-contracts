// The fluent builder surface: one component's contract, built by chaining. A
// builder is already a compiled contract — it accumulates a runtime entry and
// hands it to `compile` on first payload access.

import type { ContractRows } from "@jsx-contracts/eslint-plugin";

import type { RuntimeBan, RuntimeEntry, RuntimeProps } from "./compile.js";
import { compile } from "./compile.js";
import type { Forbid, Gate, Literal, SlotSpec } from "./contract-entry.js";
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
 * One component's contract, built fluently. A builder is already a
 * `CompiledContracts`: call `rules()` on it directly, or combine several with
 * `mergeContracts`. Every call returns a new builder — earlier references
 * stay unchanged.
 *
 * @example
 * const tray = contract("Widget.Tray")
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
 * Start a fluent contract for one component. Internal: consumers reach a
 * builder by destructuring `contract` off a `contractsFor` binding, which
 * supplies `from` — the gate is stated once for the whole design system rather
 * than repeated per component. The type-state enforces order: slots must be
 * declared before `requires`/`exclusive` can reference them, and a `when` ban
 * must forbid something before the chain continues.
 *
 * @example
 * const { contract } = contractsFor<typeof import("@acme/ds")>("@acme/ds");
 * export const tray = contract("Widget.Tray")
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
    get rows(): ContractRows {
      return finalize().rows;
    },
    rules(severity): ReturnType<CompiledContracts["rules"]> {
      return finalize().rules(severity);
    },
  };
}
