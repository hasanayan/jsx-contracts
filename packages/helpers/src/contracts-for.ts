// The binding: the entry point that takes the import gate — and the design
// system's module type — and hands back the fluent builder. It is the only way
// to reach a builder; the package exports no unbound `contract`, so a gate is
// never written twice.

import type { Gate } from "./compile.js";
import type { ComponentNames } from "./component-names.js";
import type { ContractBuilder } from "./contract-builder.js";
import { contract } from "./contract-builder.js";

/**
 * Bind a gate and a module's types once, and destructure `contract` off the
 * result: the import gate is stated for the whole design system rather than
 * repeated per component, and component names are completed and checked
 * against the module's capitalized export paths, so a typo — or a component
 * renamed away in the design system — fails to compile.
 * `typeof import("...")` is type-only; the module is never loaded at runtime,
 * so the ESLint config stays free of the design system's runtime dependencies.
 *
 * A component from another package needs its own binding; per-slot,
 * per-descendant, per-forbid and per-ancestor gates are unaffected.
 *
 * @param from - The import gate every component of this binding is gated by.
 * @example
 * const { contract } = contractsFor<typeof import("@acme/ds")>("@acme/ds");
 * export const tray = contract("Widget.Tray")
 *   .hasSlot(".Title").atLeast(1)
 *   .hasSlot(".Action")
 *   .slotRequires(".Action", ".Title");
 * // eslint.config.js → rules: mergeContracts(tray, ...).rules()
 */
export function contractsFor<Module>(from: Gate): BoundContracts<Module> {
  // The starter closes over `from` rather than reading it off `this`, so
  // destructuring it — the documented spelling — keeps the gate.
  return {
    contract: <const Component extends ComponentNames<Module> & string>(
      component: Component,
    ): ContractBuilder<never, { module: Module; component: Component }> =>
      contract<{ module: Module; component: Component }>(component, from),
  };
}

/** What `contractsFor` returns: the bound `contract` starter. */
export interface BoundContracts<Module> {
  /**
   * Start one component's contract builder, gated by the binding. Declared as
   * a property rather than a method because it is meant to be destructured off
   * the binding — that is the only way to reach a builder. The component's name
   * is captured as a literal, and the module travels with it, so the builder
   * can check shorthand part names against the module's export paths.
   */
  contract: <const Component extends ComponentNames<Module> & string>(
    component: Component,
  ) => ContractBuilder<never, { module: Module; component: Component }>;
}
