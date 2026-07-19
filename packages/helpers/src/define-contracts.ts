// The binding: the entry points that take the import gate — and, for
// `contractsFor`, the design system's module type — and hand a component-keyed
// map or a fluent builder to the compiler.

import type { RuntimeEntry } from "./compile.js";
import { compile } from "./compile.js";
import type { ComponentNames } from "./component-names.js";
import type { ContractBuilder } from "./contract-builder.js";
import { contract } from "./contract-builder.js";
import type {
  AnyComponentEntry,
  ContractsInput,
  Gate,
} from "./contract-entry.js";
import type { CompiledContracts } from "./rule-table.js";

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
