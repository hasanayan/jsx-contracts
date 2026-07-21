import type { Gate } from "../compile/entry.js";

import type { ComponentNames } from "./bound-names.js";
import type { ContractBuilder, Fragment } from "./builder.js";
import { contract } from "./builder.js";
import type { Condition, PropCondition } from "./conditions.js";
import { allOf, anyOf, not, prop } from "./conditions.js";

/**
 * The bound `contract` starter. Given a name it starts that component's
 * contract; given none it starts a nameless one, for `when`.
 */
interface BoundContract<Module> {
  <const Component extends ComponentNames<Module> & string>(
    component: Component,
  ): ContractBuilder<never, { module: Module; component: Component }>;
  (): Fragment;
}

/**
 * Bind a gate and a module's types once, and destructure what you need off the
 * result: the import gate is stated for the whole bound module rather than
 * repeated per component, and component names are completed and checked against
 * the module's capitalized export paths, so a typo fails to compile.
 * `typeof import("...")` is type-only; the module is never loaded at runtime.
 *
 * A component from another package needs its own binding; per-slot,
 * per-descendant, per-forbid and per-ancestor gates are unaffected.
 *
 * @param from - The import gate every component of this binding is gated by.
 * @example
 * const { contract, prop, allOf, anyOf, not } =
 *   contractsFor<typeof import("@acme/ds")>("@acme/ds");
 * export const tray = contract("Widget.Tray")
 *   .hasSlot(".Title").atLeast(1)
 *   .hasSlot(".Action")
 *   .when(prop("variant").is("compact"), contract().hasSlot(".Title"));
 * // eslint.config.js → rules: mergeContracts(tray, ...).rules()
 */
export function contractsFor<Module>(from: Gate): BoundContracts<Module> {
  // The gate is stated here and nowhere else, so this is where a missing one
  // is caught — before a single contract is built against the binding.
  if (typeof from !== "string" || from.length === 0) {
    throw new Error(
      "contractsFor: needs an import gate — the module its components must " +
        "be imported from.",
    );
  }

  const starter = (component?: string): unknown =>
    component === undefined ? contract() : contract(component, from);

  return {
    contract: starter as BoundContract<Module>,
    prop,
    allOf,
    anyOf,
    not,
  };
}

/**
 * What `contractsFor` returns: the bound `contract` starter, and the condition
 * constructors that gate what it builds.
 */
export interface BoundContracts<Module> {
  /**
   * Start one component's contract builder, gated by the binding — or, called
   * with no name, a nameless contract for `when`. The component's name is
   * captured as a literal, and the module travels with it, so the builder can
   * check shorthand part names against the module's export paths.
   */
  contract: BoundContract<Module>;
  /** Name a prop to condition on: `.is(...values)` or `.isPresent()`. */
  prop: (name: string) => PropCondition;
  /** Every condition must hold. Two operands minimum; nests freely. */
  allOf: (
    first: Condition,
    second: Condition,
    ...rest: Condition[]
  ) => Condition;
  /** At least one condition must hold. Two operands minimum; nests freely. */
  anyOf: (
    first: Condition,
    second: Condition,
    ...rest: Condition[]
  ) => Condition;
  /**
   * The condition must not hold. Inactive on an element carrying a spread —
   * the spread may carry the very prop being negated.
   */
  not: (condition: Condition) => Condition;
}
