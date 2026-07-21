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
  SlotBranchV2,
  SlotV2,
  SlotsRowV2,
} from "@jsx-contracts/eslint-plugin";

import type { Condition } from "./conditions.js";

/** Severity of an emitted rule. */
export type Severity = "error" | "warn";

// The plugin's v2 children rule id. `authoring` stays type-only over the plugin,
// so the id is restated here rather than imported.
const SLOTS_CLOSURE_ID = "@jsx-contracts/slots.closure";

/**
 * The spec-builder a slot callback receives. Every verb is local to the slot it
 * constrains and returns the builder, so specs read as one chain:
 * `(s) => s.exactly(1).requires(".Icon")`.
 *
 * `Sibling` is the map's own key union, so `requires`/`excludes` only accept
 * declared siblings — a typo is a compile error with autocomplete.
 */
export interface SlotSpecBuilder<Sibling extends string = string> {
  /**
   * Bind the slot's identity. Required on a bare capitalized key; a config-time
   * error on a dotted key, which already implies its identity from the subject.
   * `from` is the element's own import gate for a foreign component.
   */
  is(name: string, from?: string): SlotSpecBuilder<Sibling>;
  /** The slot must appear at least `count` times; the upper bound stays open. */
  min(count: number): SlotSpecBuilder<Sibling>;
  /** The slot may appear at most `count` times; the lower bound stays nought. */
  max(count: number): SlotSpecBuilder<Sibling>;
  /** The slot must appear exactly `count` times: both bounds at once. */
  exactly(count: number): SlotSpecBuilder<Sibling>;
  /** The slot may only render alongside each named sibling. */
  requires(...siblings: Sibling[]): SlotSpecBuilder<Sibling>;
  /** The slot may not render alongside any named sibling; symmetry is computed. */
  excludes(...siblings: Sibling[]): SlotSpecBuilder<Sibling>;
}

/**
 * A slot's spec: `true` for an unconstrained slot, or a callback given the
 * spec-builder. A dotted key already implies the slot's identity; `true` is
 * `(s) => s.is("<key>")`.
 */
export type SlotSpec<Sibling extends string = string> =
  true | ((spec: SlotSpecBuilder<Sibling>) => SlotSpecBuilder<Sibling>);

/** A slots map: alias key → spec. */
export type SlotsMap = Record<string, SlotSpec>;

/**
 * A slots map whose sibling references are keyed to its own aliases: `K` is
 * inferred from the map's keys, so a spec's `requires`/`excludes` only accept
 * the aliases actually declared.
 */
export type SlotsMapOf<K extends string> = Record<K, SlotSpec<K>>;

/** One contract's accumulating state inside the collector. */
interface ContractState {
  readonly name: string;
  readonly from: string;
  slots: SlotV2[] | undefined;
  loose: boolean;
  branches: SlotBranchV2[];
}

/**
 * The delta builder a `when` branch receives: the verbs that change the
 * children facet while the condition holds. Every verb records into the branch
 * and chains, so a delta reads as `(c) => c.forbidSlot(".Footer")`.
 */
export interface BranchDeltaBuilder {
  /** Forbid a base slot while the branch holds; forbid wins over any extend. */
  forbidSlot: (alias: string) => BranchDeltaBuilder;
  /** Raise a base slot's minimum to at least one while the branch holds. */
  requireSlot: (alias: string) => BranchDeltaBuilder;
  /** Add or re-declare slots while the branch holds; a redeclared alias replaces. */
  extend: (map: SlotsMap) => BranchDeltaBuilder;
}

/** A branch delta: the callback given the {@link BranchDeltaBuilder}. */
export type BranchDelta = (delta: BranchDeltaBuilder) => BranchDeltaBuilder;

/** Options a branch carries beyond its condition and delta. */
export interface BranchOptions {
  /** The author's intent, appended to any violation this branch drives. */
  because?: string;
}

/** The chainable builder a `contract()` call returns. */
export interface ContractBuilderV2 {
  /**
   * Declare the container's direct-children schema. The map is closed by
   * default. Calling it twice throws — one component, one children map.
   *
   * Sibling references inside a spec (`requires`/`excludes`) are typed against
   * the map's own keys, so a mistyped alias is a compile error.
   */
  slots: <K extends string>(map: SlotsMapOf<K>) => ContractBuilderV2;
  /** Opt out of closure: undeclared children stop being violations. */
  loose: () => ContractBuilderV2;
  /**
   * Add a conditional branch: a delta over the children facet applied only
   * while `condition` holds on the matched element. Branches are independent
   * facts — declaration order never matters. `because` carries the author's
   * intent into any violation the branch drives.
   *
   * @example
   * .when(prop("onClick").isPresent(), (c) => c.forbidSlot(".Footer"), {
   *   because: "A clickable card has no footer.",
   * })
   */
  when: (
    condition: Condition,
    delta: BranchDelta,
    options?: BranchOptions,
  ) => ContractBuilderV2;
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

/** What one slot callback records before the key form resolves its identity. */
interface SlotDraft {
  isCalled: boolean;
  isName: string | undefined;
  isFrom: string | undefined;
  min: number | undefined;
  max: number | undefined;
  requires: string[];
  excludes: string[];
}

function emptyDraft(): SlotDraft {
  return {
    isCalled: false,
    isName: undefined,
    isFrom: undefined,
    min: undefined,
    max: undefined,
    requires: [],
    excludes: [],
  };
}

/** A recording spec-builder: every verb writes to `draft` and chains. */
function recorder(draft: SlotDraft): SlotSpecBuilder {
  const builder: SlotSpecBuilder = {
    is(name, from): SlotSpecBuilder {
      draft.isCalled = true;
      draft.isName = name;
      draft.isFrom = from;

      return builder;
    },
    min(count): SlotSpecBuilder {
      draft.min = count;

      return builder;
    },
    max(count): SlotSpecBuilder {
      draft.max = count;

      return builder;
    },
    exactly(count): SlotSpecBuilder {
      draft.min = count;
      draft.max = count;

      return builder;
    },
    requires(...siblings): SlotSpecBuilder {
      draft.requires.push(...siblings);

      return builder;
    },
    excludes(...siblings): SlotSpecBuilder {
      draft.excludes.push(...siblings);

      return builder;
    },
  };

  return builder;
}

/** A dotted name is a member of the subject; anything else stands alone. */
function resolveName(name: string, subject: string): string {
  return name.startsWith(".") ? `${subject}${name}` : name;
}

/** Assemble a slot row from its resolved identity and recorded spec. */
function assembleSlot(
  alias: string,
  name: string,
  from: string | undefined,
  draft: SlotDraft,
): SlotV2 {
  const slot: SlotV2 = { alias, match: { kind: "name", name } };

  if (from !== undefined) {
    slot.from = from;
  }

  if (draft.min !== undefined || draft.max !== undefined) {
    slot.count = {};

    if (draft.min !== undefined) {
      slot.count.min = draft.min;
    }

    if (draft.max !== undefined) {
      slot.count.max = draft.max;
    }
  }

  if (draft.requires.length > 0) {
    slot.requires = [...draft.requires];
  }

  if (draft.excludes.length > 0) {
    slot.excludes = [...draft.excludes];
  }

  return slot;
}

/**
 * Resolve one map entry to a slot row. The key form decides where identity
 * comes from: a dotted key implies it (and an explicit `is()` is a double-bind
 * error); a bare capitalized key must call `is()`; a bare lowercase key is an
 * intrinsic that stands as written; `true` is `is("<key>")`.
 */
function buildSlot(alias: string, spec: SlotSpec, subject: string): SlotV2 {
  const dotted = alias.startsWith(".");

  if (spec === true) {
    return assembleSlot(
      alias,
      resolveName(alias, subject),
      undefined,
      emptyDraft(),
    );
  }

  const draft = emptyDraft();

  spec(recorder(draft));

  if (dotted) {
    if (draft.isCalled) {
      throw new Error(
        `defineContracts: slot "${alias}" binds its identity twice — a dotted ` +
          "key already implies is(); drop the is() call.",
      );
    }

    return assembleSlot(alias, resolveName(alias, subject), undefined, draft);
  }

  if (draft.isCalled) {
    return assembleSlot(
      alias,
      resolveName(draft.isName ?? alias, subject),
      draft.isFrom,
      draft,
    );
  }

  if (/^[A-Z]/.test(alias)) {
    throw new Error(
      `defineContracts: slot "${alias}" must bind an identity with ` +
        "is(name, from?) — a bare capitalized key has none to imply.",
    );
  }

  // A bare lowercase key is an intrinsic: no identity to bind.
  return assembleSlot(alias, alias, undefined, draft);
}

function parseSlots(map: SlotsMap, subject: string): SlotV2[] {
  return Object.entries(map).map(([alias, spec]) =>
    buildSlot(alias, spec, subject),
  );
}

/** A recording delta builder: every verb writes to `branch` and chains. */
function deltaRecorder(
  branch: SlotBranchV2,
  subject: string,
): BranchDeltaBuilder {
  const builder: BranchDeltaBuilder = {
    forbidSlot(alias): BranchDeltaBuilder {
      (branch.forbidSlots ??= []).push(alias);

      return builder;
    },
    requireSlot(alias): BranchDeltaBuilder {
      (branch.requireSlots ??= []).push(alias);

      return builder;
    },
    extend(map): BranchDeltaBuilder {
      (branch.extend ??= []).push(...parseSlots(map, subject));

      return builder;
    },
  };

  return builder;
}

/** Compile one `when` call into a branch row, its shorthand expanded on `subject`. */
function buildBranch(
  condition: Condition,
  delta: BranchDelta,
  options: BranchOptions | undefined,
  subject: string,
): SlotBranchV2 {
  const branch: SlotBranchV2 = { when: condition.when };

  if (options?.because !== undefined) {
    branch.because = options.because;
  }

  delta(deltaRecorder(branch, subject));

  return branch;
}

function compileStates(states: ContractState[]): ContractRowsV2 {
  const rows: SlotsRowV2[] = [];

  for (const state of states) {
    // A contract with neither a children map nor a branch declares no children
    // facet — no row.
    if (state.slots === undefined && state.branches.length === 0) {
      continue;
    }

    const row: SlotsRowV2 = {
      facet: "slots",
      match: { kind: "name", name: state.name },
      slots: state.slots ?? [],
      closed: !state.loose,
    };

    if (state.branches.length > 0) {
      row.branches = state.branches;
    }

    rows.push(row);
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

      // The interface keeps `K` for sibling typing; the parser reads the loose
      // shape, so the narrowing is the callers' and this is where it is spent.
      state.slots = parseSlots(map, state.name);

      return builder;
    },
    loose(): ContractBuilderV2 {
      guard();
      state.loose = true;

      return builder;
    },
    when(condition, delta, options): ContractBuilderV2 {
      guard();
      state.branches.push(buildBranch(condition, delta, options, state.name));

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
      branches: [],
    };

    states.set(name, state);

    return makeBuilder(state, () => frozen);
  };

  build({ contract });
  frozen = true;

  return makeRuleSet(compileStates([...states.values()]));
}
