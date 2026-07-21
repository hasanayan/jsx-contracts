/**
 * The ADR 0003 authoring entry: `defineContracts` and the `contract(name, from)`
 * primitive it injects. A contract registers when `contract()` is called — no
 * return needed — builders accumulate in place, and the rule set freezes when
 * the callback returns. This compiles to row schema v2.
 *
 * The old fluent surface (`contractsFor`/`contract()` chains) is untouched; both
 * ship until ADR 0003 T8 deletes the old one.
 */

import type {
  ContractRowsV2,
  SlotV2,
  SlotsRowV2,
} from "@jsx-contracts/eslint-plugin";

/** Severity of an emitted rule. */
export type Severity = "error" | "warn";

// The plugin's v2 children rule id. `authoring` stays type-only over the plugin,
// so the id is restated here rather than imported.
const SLOTS_CLOSURE_ID = "@jsx-contracts/slots.closure";

/**
 * The spec-builder a slot callback receives. No verbs yet — bounds and
 * relationships arrive with ADR 0003 T2 — so the callback form is accepted and
 * extended in place then.
 */
export type SlotSpecBuilder = Record<never, never>;

/**
 * A slot's spec: `true` for an unconstrained slot, or a callback given the
 * spec-builder. A dotted key already implies the slot's identity; `true` and a
 * bare callback add no constraint.
 */
export type SlotSpec = true | ((spec: SlotSpecBuilder) => SlotSpecBuilder);

/** A slots map: alias key → spec. */
export type SlotsMap = Record<string, SlotSpec>;

/** One contract's accumulating state inside the collector. */
interface ContractState {
  readonly name: string;
  readonly from: string;
  slots: SlotV2[] | undefined;
  loose: boolean;
}

/** The chainable builder a `contract()` call returns. */
export interface ContractBuilderV2 {
  /**
   * Declare the container's direct-children schema. The map is closed by
   * default. Calling it twice throws — one component, one children map.
   */
  slots: (map: SlotsMap) => ContractBuilderV2;
  /** Opt out of closure: undeclared children stop being violations. */
  loose: () => ContractBuilderV2;
}

/** What the collector callback is handed. */
export interface CollectorContext {
  contract: (name: string, from: string) => ContractBuilderV2;
}

/** A compiled rule set: the v2 rows and the flat-config helper. */
export interface RuleSetV2 {
  /** The v2 rule table. Reachable so it can be inspected or post-processed. */
  rows: ContractRowsV2;
  /** The flat-config entry for the v2 children rule, at the given severity. */
  rules: (severity?: Severity) => Record<string, [Severity, ContractRowsV2]>;
}

/** A dotted alias implies a member of the subject; a bare alias stands alone. */
function identityFor(alias: string, subject: string): string {
  return alias.startsWith(".") ? `${subject}${alias}` : alias;
}

const passthrough: SlotSpecBuilder = {};

function parseSlots(map: SlotsMap, subject: string): SlotV2[] {
  return Object.entries(map).map(([alias, spec]) => {
    if (typeof spec === "function") {
      // Run the callback for its shape; T1 has no verbs to record.
      spec(passthrough);
    }

    return {
      alias,
      match: { kind: "name", name: identityFor(alias, subject) },
    };
  });
}

function compileStates(states: ContractState[]): ContractRowsV2 {
  const rows: SlotsRowV2[] = [];

  for (const state of states) {
    // A contract with no children map declares no children facet — no row.
    if (state.slots === undefined) {
      continue;
    }

    rows.push({
      facet: "slots",
      match: { kind: "name", name: state.name },
      slots: state.slots,
      closed: !state.loose,
    });
  }

  return rows;
}

/** Wrap a v2 rule table as a `RuleSetV2` — the only way one is made. */
export function makeRuleSet(rows: ContractRowsV2): RuleSetV2 {
  return {
    rows,
    rules(
      severity: Severity = "error",
    ): Record<string, [Severity, ContractRowsV2]> {
      return { [SLOTS_CLOSURE_ID]: [severity, rows] };
    },
  };
}

function makeBuilder(
  state: ContractState,
  isFrozen: () => boolean,
): ContractBuilderV2 {
  const guard = (): void => {
    if (isFrozen()) {
      throw new Error(
        `defineContracts: contract "${state.name}" used after the collector ` +
          "callback returned — the rule set is frozen.",
      );
    }
  };

  const builder: ContractBuilderV2 = {
    slots(map): ContractBuilderV2 {
      guard();

      if (state.slots !== undefined) {
        throw new Error(
          `defineContracts: contract "${state.name}" declares slots twice.`,
        );
      }

      state.slots = parseSlots(map, state.name);

      return builder;
    },
    loose(): ContractBuilderV2 {
      guard();
      state.loose = true;

      return builder;
    },
  };

  return builder;
}

/**
 * Collect a family of contracts. `contract(name, from)` registers a component
 * the moment it is called and returns a builder that accumulates in place. When
 * the callback returns, the rule set freezes: any later builder call throws.
 *
 * @example
 * export const cardRules = defineContracts(({ contract }) => {
 *   contract("Card.Heading", "~/components/Card.tsx").slots({ ".Text": true });
 * });
 */
export function defineContracts(
  build: (ctx: CollectorContext) => void,
): RuleSetV2 {
  const states = new Map<string, ContractState>();
  let frozen = false;

  const contract = (name: string, from: string): ContractBuilderV2 => {
    if (frozen) {
      throw new Error(
        `defineContracts: contract("${name}") called after the collector ` +
          "callback returned.",
      );
    }

    if (states.has(name)) {
      throw new Error(
        `defineContracts: duplicate contract for "${name}" — one component, ` +
          "one contract.",
      );
    }

    const state: ContractState = {
      name,
      from,
      slots: undefined,
      loose: false,
    };

    states.set(name, state);

    return makeBuilder(state, () => frozen);
  };

  build({ contract });
  frozen = true;

  return makeRuleSet(compileStates([...states.values()]));
}
