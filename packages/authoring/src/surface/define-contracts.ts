/**
 * The ADR 0003 authoring entry: `defineContracts` and the `contract(name, from)`
 * primitive it injects. A contract registers when `contract()` is called — no
 * return needed — builders accumulate in place, and the rule set freezes when
 * the callback returns.
 */

import type {
  AncestorRow,
  ContractRows,
  Descendant,
  Forbidden,
  MatchKey,
  PropDeprecation,
  PropSpec as PropSpecRow,
  PropsBranch,
  PropsRow,
  Slot,
  SlotBranch,
  SlotsRow,
  SubtreeBranch,
  SubtreeRow,
} from "@jsx-contracts/core";

import type { Condition } from "./conditions.js";

export type Severity = "error" | "warn";

// Restated rather than imported: `authoring` stays type-only over the plugin.
const SLOTS_CLOSURE_ID = "@jsx-contracts/slots.closure";
const PROPS_CONTRACT_ID = "@jsx-contracts/props.contract";
const SUBTREE_CONTRACT_ID = "@jsx-contracts/subtree.contract";
const ANCESTOR_CONTRACT_ID = "@jsx-contracts/ancestor.contract";

/**
 * `Sibling` is the map's own key union, so `requires`/`excludes` only accept
 * declared siblings — a typo is a compile error with autocomplete.
 */
export interface SlotSpecBuilder<Sibling extends string = string> {
  /**
   * Required on a bare capitalized key; a config-time error on a dotted key,
   * which already implies its identity from the subject.
   */
  is(name: string, from?: string): SlotSpecBuilder<Sibling>;
  min(count: number): SlotSpecBuilder<Sibling>;
  max(count: number): SlotSpecBuilder<Sibling>;
  /** Both bounds at once. */
  exactly(count: number): SlotSpecBuilder<Sibling>;
  requires(...siblings: Sibling[]): SlotSpecBuilder<Sibling>;
  /** Symmetry is computed. */
  excludes(...siblings: Sibling[]): SlotSpecBuilder<Sibling>;
}

/** `true` is `(s) => s.is("<key>")`. */
export type SlotSpec<Sibling extends string = string> =
  true | ((spec: SlotSpecBuilder<Sibling>) => SlotSpecBuilder<Sibling>);

export type SlotsMap = Record<string, SlotSpec>;

/** `K` is inferred from the map's keys, which is what types sibling references. */
export type SlotsMapOf<K extends string> = Record<K, SlotSpec<K>>;

/**
 * Unlike a slot's siblings, `requires`/`excludes` name any prop — a co-prop need
 * not have its own map entry (`href` excludes `onClick` without declaring it).
 */
export interface PropSpecBuilder {
  required(): PropSpecBuilder;
  requires(...props: string[]): PropSpecBuilder;
  excludes(...props: string[]): PropSpecBuilder;
  deprecated(useInstead?: string): PropSpecBuilder;
}

/** No `true` shorthand: a constraint-free entry is a config-time error. */
export type PropSpec = (spec: PropSpecBuilder) => PropSpecBuilder;

export type PropsMap = Record<string, PropSpec>;

/** A slot's triple model minus the sibling relations, which only fit direct children. */
export interface DescendantSpecBuilder {
  /** Required on a bare capitalized key; a config-time error on a dotted key. */
  is(name: string, from?: string): DescendantSpecBuilder;
  min(count: number): DescendantSpecBuilder;
  max(count: number): DescendantSpecBuilder;
  exactly(count: number): DescendantSpecBuilder;
}

/** `true` is `(d) => d.is("<key>")`. */
export type DescendantSpec =
  true | ((spec: DescendantSpecBuilder) => DescendantSpecBuilder);

export type DescendantsMap = Record<string, DescendantSpec>;

/**
 * An intrinsic (`"button"`), a dotted shorthand (`".Actions"`), a full name
 * (`"Dialog.Panel"`), or a self-gated `{ name, from }`. Every form runs the same
 * dotted expansion against the subject.
 */
export type ForbidEntry = string | { name: string; from?: string };

interface ContractState {
  readonly name: string;
  readonly from: string;
  slots: Slot[] | undefined;
  loose: boolean;
  strictAnalysis: boolean;
  props: PropSpecRow[] | undefined;
  requiresAnyOf: string[][];
  descendants: Descendant[] | undefined;
  forbidDescendants: Forbidden[];
  forbidDescendantProps: string[];
  notInside: Forbidden[];
  deprecated: PropDeprecation | undefined;
  branches: BranchDraft[];
}

/**
 * One `when` call, before it is split across facets: a branch can change slots,
 * props, or both, and compilation routes each delta to its own row's branches.
 */
interface BranchDraft {
  when: Condition["when"];
  because: string | undefined;
  forbidSlots: string[];
  requireSlots: string[];
  extend: Slot[];
  props: PropSpecRow[];
  forbidDescendants: Forbidden[];
  forbidDescendantProps: string[];
}

export interface BranchDeltaBuilder {
  /** Forbid wins over any extend. */
  forbidSlot: (alias: string) => BranchDeltaBuilder;
  /** Raise a base slot's minimum to at least one. */
  requireSlot: (alias: string) => BranchDeltaBuilder;
  /** A redeclared alias replaces its base spec. */
  extend: (map: SlotsMap) => BranchDeltaBuilder;
  props: (map: PropsMap) => BranchDeltaBuilder;
  forbidDescendants: (...entries: ForbidEntry[]) => BranchDeltaBuilder;
  forbidDescendantProps: (...props: string[]) => BranchDeltaBuilder;
}

export type BranchDelta = (delta: BranchDeltaBuilder) => BranchDeltaBuilder;

export interface BranchOptions {
  /** The author's intent, appended to any violation this branch drives. */
  because?: string;
}

export interface ContractBuilder {
  /** Closed by default. Calling it twice throws — one component, one children map. */
  slots: <K extends string>(map: SlotsMapOf<K>) => ContractBuilder;
  /** Opt out of closure: undeclared children stop being violations. */
  loose: () => ContractBuilder;
  /**
   * An opaque children region that intersects a rule it could break reports
   * "cannot verify" instead of being assumed fine. Rides the children map, so a
   * contract with no slots facet has nothing to guard and this throws there.
   */
  strictAnalysis: () => ContractBuilder;
  /** Always loose. Calling it twice throws. */
  props: (map: PropsMap) => ContractBuilder;
  /** Each call adds one at-least-one-of group. */
  requiresAnyOf: (...props: string[]) => ContractBuilder;
  /** {@link slots}, matched anywhere in the subtree. Calling it twice throws. */
  descendants: (map: DescendantsMap) => ContractBuilder;
  forbidDescendants: (...entries: ForbidEntry[]) => ContractBuilder;
  forbidDescendantProps: (...props: string[]) => ContractBuilder;
  notInside: (...ancestors: ForbidEntry[]) => ContractBuilder;
  /** Calling it twice throws. */
  deprecated: (useInstead?: string) => ContractBuilder;
  /**
   * A delta applied only while `condition` holds. Branches are independent facts
   * — declaration order never matters.
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
  ) => ContractBuilder;
}

export interface CollectorContext {
  contract: (name: string, from: string) => ContractBuilder;
}

export interface RuleSet {
  /** Reachable so it can be inspected or post-processed. */
  rows: ContractRows;
  rules: (severity?: Severity) => Record<string, [Severity, ContractRows]>;
}

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

/**
 * The contract a relative name is written against: its full name and its gate.
 * A dotted name is a member of the subject, so it is gated with the subject —
 * `".Heading"` under a gated `contract("Card", …)` means Card's own Heading, not
 * any element that happens to be called `Card.Heading`.
 */
interface Subject {
  name: string;
  from: string;
}

function subjectOf(state: ContractState): Subject {
  return { name: state.name, from: state.from };
}

/**
 * A subject's identity is its name *and* its gate — two design systems' `Button`
 * are distinct components, and the engine already matches on the pair. A NUL
 * cannot appear in either half, so it separates them without collision.
 */
export function subjectKey(name: string, from: string | undefined): string {
  return `${name} ${from ?? ""}`;
}

/** Every row of a contract carries the subject's own gate. */
function subjectMatch(state: ContractState): MatchKey {
  return { kind: "name", name: state.name, from: state.from };
}

function isRelative(name: string): boolean {
  return name.startsWith(".");
}

function resolveName(name: string, subject: Subject): string {
  return isRelative(name) ? `${subject.name}${name}` : name;
}

function resolveMatch(
  name: string,
  from: string | undefined,
  subject: Subject,
): MatchKey {
  const gate = from ?? (isRelative(name) ? subject.from : undefined);
  const match: MatchKey = { kind: "name", name: resolveName(name, subject) };

  if (gate !== undefined) {
    match.from = gate;
  }

  return match;
}

function assembleSlot(alias: string, match: MatchKey, draft: SlotDraft): Slot {
  const slot: Slot = { alias, match };

  if (draft.min !== undefined || draft.max !== undefined) {
    // One declaration contradicting itself, so it throws here rather than
    // reaching `findUnsatisfiable`, which is for branches that disagree.
    if (
      draft.min !== undefined &&
      draft.max !== undefined &&
      draft.min > draft.max
    ) {
      throw new Error(
        `defineContracts: slot "${alias}" declares min(${String(draft.min)}) ` +
          `above max(${String(draft.max)}) — no count satisfies it.`,
      );
    }

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
 * The key form decides where identity comes from: dotted implies it (so an
 * explicit `is()` double-binds), bare capitalized must call `is()`, bare
 * lowercase is an intrinsic standing as written.
 */
function buildSlot(alias: string, spec: SlotSpec, subject: Subject): Slot {
  const dotted = isRelative(alias);

  if (spec === true) {
    return assembleSlot(
      alias,
      resolveMatch(alias, undefined, subject),
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

    return assembleSlot(alias, resolveMatch(alias, undefined, subject), draft);
  }

  if (draft.isCalled) {
    return assembleSlot(
      alias,
      resolveMatch(draft.isName ?? alias, draft.isFrom, subject),
      draft,
    );
  }

  if (/^[A-Z]/.test(alias)) {
    throw new Error(
      `defineContracts: slot "${alias}" must bind an identity with ` +
        "is(name, from?) — a bare capitalized key has none to imply.",
    );
  }

  // A bare lowercase key is an intrinsic: no identity to bind, so no gate.
  return assembleSlot(alias, { kind: "name", name: alias }, draft);
}

function parseSlots(map: SlotsMap, subject: Subject): Slot[] {
  return Object.entries(map).map(([alias, spec]) =>
    buildSlot(alias, spec, subject),
  );
}

interface PropDraft {
  required: boolean;
  requires: string[];
  excludes: string[];
  deprecated: { useInstead?: string } | undefined;
}

function emptyPropDraft(): PropDraft {
  return {
    required: false,
    requires: [],
    excludes: [],
    deprecated: undefined,
  };
}

function propRecorder(draft: PropDraft): PropSpecBuilder {
  const builder: PropSpecBuilder = {
    required(): PropSpecBuilder {
      draft.required = true;

      return builder;
    },
    requires(...props): PropSpecBuilder {
      draft.requires.push(...props);

      return builder;
    },
    excludes(...props): PropSpecBuilder {
      draft.excludes.push(...props);

      return builder;
    },
    deprecated(useInstead): PropSpecBuilder {
      draft.deprecated = useInstead === undefined ? {} : { useInstead };

      return builder;
    },
  };

  return builder;
}

function buildPropSpec(prop: string, spec: PropSpec): PropSpecRow {
  const draft = emptyPropDraft();

  spec(propRecorder(draft));

  const constrained =
    draft.required ||
    draft.requires.length > 0 ||
    draft.excludes.length > 0 ||
    draft.deprecated !== undefined;

  if (!constrained) {
    throw new Error(
      `defineContracts: prop "${prop}" states no constraint — every props ` +
        "entry must call at least one of required/requires/excludes/deprecated.",
    );
  }

  const row: PropSpecRow = { prop };

  if (draft.required) {
    row.required = true;
  }

  if (draft.requires.length > 0) {
    row.requires = [...draft.requires];
  }

  if (draft.excludes.length > 0) {
    row.excludes = [...draft.excludes];
  }

  if (draft.deprecated !== undefined) {
    row.deprecated = draft.deprecated;
  }

  return row;
}

function parseProps(map: PropsMap): PropSpecRow[] {
  return Object.entries(map).map(([prop, spec]) => buildPropSpec(prop, spec));
}

// Reuses the slot key-form machinery, then drops the sibling relations a
// descendant has no use for.
function parseDescendants(map: DescendantsMap, subject: Subject): Descendant[] {
  return Object.entries(map).map(([alias, spec]) => {
    const slot = buildSlot(alias, spec as unknown as SlotSpec, subject);
    const descendant: Descendant = { alias: slot.alias, match: slot.match };

    if (slot.count !== undefined) {
      descendant.count = slot.count;
    }

    return descendant;
  });
}

function buildForbidden(entry: ForbidEntry, subject: Subject): Forbidden {
  const name = typeof entry === "string" ? entry : entry.name;
  const from = typeof entry === "string" ? undefined : entry.from;

  return { match: resolveMatch(name, from, subject) };
}

function parseForbidList(
  entries: ForbidEntry[],
  subject: Subject,
): Forbidden[] {
  return entries.map((entry) => buildForbidden(entry, subject));
}

function deltaRecorder(
  draft: BranchDraft,
  subject: Subject,
): BranchDeltaBuilder {
  const builder: BranchDeltaBuilder = {
    forbidSlot(alias): BranchDeltaBuilder {
      draft.forbidSlots.push(alias);

      return builder;
    },
    requireSlot(alias): BranchDeltaBuilder {
      draft.requireSlots.push(alias);

      return builder;
    },
    extend(map): BranchDeltaBuilder {
      draft.extend.push(...parseSlots(map, subject));

      return builder;
    },
    props(map): BranchDeltaBuilder {
      draft.props.push(...parseProps(map));

      return builder;
    },
    forbidDescendants(...entries): BranchDeltaBuilder {
      draft.forbidDescendants.push(...parseForbidList(entries, subject));

      return builder;
    },
    forbidDescendantProps(...props): BranchDeltaBuilder {
      draft.forbidDescendantProps.push(...props);

      return builder;
    },
  };

  return builder;
}

function buildBranch(
  condition: Condition,
  delta: BranchDelta,
  options: BranchOptions | undefined,
  subject: Subject,
): BranchDraft {
  const draft: BranchDraft = {
    when: condition.when,
    because: options?.because,
    forbidSlots: [],
    requireSlots: [],
    extend: [],
    props: [],
    forbidDescendants: [],
    forbidDescendantProps: [],
  };

  delta(deltaRecorder(draft, subject));

  return draft;
}

function slotBranchOf(draft: BranchDraft): SlotBranch | undefined {
  if (
    draft.forbidSlots.length === 0 &&
    draft.requireSlots.length === 0 &&
    draft.extend.length === 0
  ) {
    return undefined;
  }

  const branch: SlotBranch = { when: draft.when };

  if (draft.because !== undefined) {
    branch.because = draft.because;
  }

  if (draft.extend.length > 0) {
    branch.extend = draft.extend;
  }

  if (draft.forbidSlots.length > 0) {
    branch.forbidSlots = draft.forbidSlots;
  }

  if (draft.requireSlots.length > 0) {
    branch.requireSlots = draft.requireSlots;
  }

  return branch;
}

function propsBranchOf(draft: BranchDraft): PropsBranch | undefined {
  if (draft.props.length === 0) {
    return undefined;
  }

  const branch: PropsBranch = { when: draft.when, props: draft.props };

  if (draft.because !== undefined) {
    branch.because = draft.because;
  }

  return branch;
}

function subtreeBranchOf(draft: BranchDraft): SubtreeBranch | undefined {
  if (
    draft.forbidDescendants.length === 0 &&
    draft.forbidDescendantProps.length === 0
  ) {
    return undefined;
  }

  const branch: SubtreeBranch = { when: draft.when };

  if (draft.because !== undefined) {
    branch.because = draft.because;
  }

  if (draft.forbidDescendants.length > 0) {
    branch.forbidDescendants = draft.forbidDescendants;
  }

  if (draft.forbidDescendantProps.length > 0) {
    branch.forbidDescendantProps = draft.forbidDescendantProps;
  }

  return branch;
}

function compileStates(states: ContractState[]): ContractRows {
  const rows: ContractRows = [];

  for (const state of states) {
    const slotBranches = state.branches
      .map(slotBranchOf)
      .filter((branch): branch is SlotBranch => branch !== undefined);

    const propsBranches = state.branches
      .map(propsBranchOf)
      .filter((branch): branch is PropsBranch => branch !== undefined);

    const subtreeBranches = state.branches
      .map(subtreeBranchOf)
      .filter((branch): branch is SubtreeBranch => branch !== undefined);

    // Each row ships only when something states its facet.
    if (state.slots !== undefined || slotBranches.length > 0) {
      const row: SlotsRow = {
        facet: "slots",
        match: subjectMatch(state),
        slots: state.slots ?? [],
        closed: !state.loose,
      };

      if (state.strictAnalysis) {
        row.strictAnalysis = true;
      }

      if (slotBranches.length > 0) {
        row.branches = slotBranches;
      }

      rows.push(row);
    } else if (state.strictAnalysis) {
      throw new Error(
        `defineContracts: contract "${state.name}" calls strictAnalysis() but ` +
          "declares no children — strictness guards a children map.",
      );
    }

    if (
      state.props !== undefined ||
      state.requiresAnyOf.length > 0 ||
      propsBranches.length > 0
    ) {
      const row: PropsRow = {
        facet: "props",
        match: subjectMatch(state),
        props: state.props ?? [],
      };

      if (state.requiresAnyOf.length > 0) {
        row.requiresAnyOf = state.requiresAnyOf;
      }

      if (propsBranches.length > 0) {
        row.branches = propsBranches;
      }

      rows.push(row);
    }

    if (
      state.descendants !== undefined ||
      state.forbidDescendants.length > 0 ||
      state.forbidDescendantProps.length > 0 ||
      subtreeBranches.length > 0
    ) {
      const row: SubtreeRow = {
        facet: "subtree",
        match: subjectMatch(state),
        descendants: state.descendants ?? [],
        forbidDescendants: state.forbidDescendants,
        forbidDescendantProps: state.forbidDescendantProps,
      };

      if (subtreeBranches.length > 0) {
        row.branches = subtreeBranches;
      }

      rows.push(row);
    }

    if (state.notInside.length > 0 || state.deprecated !== undefined) {
      const row: AncestorRow = {
        facet: "ancestor",
        match: subjectMatch(state),
        notInside: state.notInside,
      };

      if (state.deprecated !== undefined) {
        row.deprecated = state.deprecated;
      }

      rows.push(row);
    }
  }

  return rows;
}

export function makeRuleSet(rows: ContractRows): RuleSet {
  return {
    rows,
    rules(
      severity: Severity = "error",
    ): Record<string, [Severity, ContractRows]> {
      const entries: Record<string, [Severity, ContractRows]> = {
        [SLOTS_CLOSURE_ID]: [severity, rows],
      };

      // Every rule filters the shared table to its own facet, so a facet-free
      // table needs no entry for it.
      if (rows.some((row) => row.facet === "props")) {
        entries[PROPS_CONTRACT_ID] = [severity, rows];
      }

      if (rows.some((row) => row.facet === "subtree")) {
        entries[SUBTREE_CONTRACT_ID] = [severity, rows];
      }

      if (rows.some((row) => row.facet === "ancestor")) {
        entries[ANCESTOR_CONTRACT_ID] = [severity, rows];
      }

      return entries;
    },
  };
}

function makeBuilder(
  state: ContractState,
  isFrozen: () => boolean,
): ContractBuilder {
  const guard = (): void => {
    if (isFrozen()) {
      throw new Error(
        `defineContracts: contract "${state.name}" used after the collector ` +
          "callback returned — the rule set is frozen.",
      );
    }
  };

  const builder: ContractBuilder = {
    slots(map): ContractBuilder {
      guard();

      if (state.slots !== undefined) {
        throw new Error(
          `defineContracts: contract "${state.name}" declares slots twice.`,
        );
      }

      // `K` exists for sibling typing only; the parser reads the loose shape.
      state.slots = parseSlots(map, subjectOf(state));

      return builder;
    },
    loose(): ContractBuilder {
      guard();
      state.loose = true;

      return builder;
    },
    strictAnalysis(): ContractBuilder {
      guard();
      state.strictAnalysis = true;

      return builder;
    },
    props(map): ContractBuilder {
      guard();

      if (state.props !== undefined) {
        throw new Error(
          `defineContracts: contract "${state.name}" declares props twice.`,
        );
      }

      state.props = parseProps(map);

      return builder;
    },
    requiresAnyOf(...props): ContractBuilder {
      guard();

      if (props.length === 0) {
        throw new Error(
          `defineContracts: contract "${state.name}" requiresAnyOf() needs ` +
            "at least one prop.",
        );
      }

      state.requiresAnyOf.push([...props]);

      return builder;
    },
    descendants(map): ContractBuilder {
      guard();

      if (state.descendants !== undefined) {
        throw new Error(
          `defineContracts: contract "${state.name}" declares descendants twice.`,
        );
      }

      state.descendants = parseDescendants(map, subjectOf(state));

      return builder;
    },
    forbidDescendants(...entries): ContractBuilder {
      guard();
      state.forbidDescendants.push(
        ...parseForbidList(entries, subjectOf(state)),
      );

      return builder;
    },
    forbidDescendantProps(...props): ContractBuilder {
      guard();
      state.forbidDescendantProps.push(...props);

      return builder;
    },
    notInside(...ancestors): ContractBuilder {
      guard();
      state.notInside.push(...parseForbidList(ancestors, subjectOf(state)));

      return builder;
    },
    deprecated(useInstead): ContractBuilder {
      guard();

      if (state.deprecated !== undefined) {
        throw new Error(
          `defineContracts: contract "${state.name}" declares deprecated twice.`,
        );
      }

      state.deprecated = useInstead === undefined ? {} : { useInstead };

      return builder;
    },
    when(condition, delta, options): ContractBuilder {
      guard();
      state.branches.push(
        buildBranch(condition, delta, options, subjectOf(state)),
      );

      return builder;
    },
  };

  return builder;
}

/**
 * `contract(name, from)` registers a component the moment it is called. When the
 * callback returns the rule set freezes: any later builder call throws.
 *
 * @example
 * export const cardRules = defineContracts(({ contract }) => {
 *   contract("Card.Heading", "~/components/Card.tsx").slots({ ".Text": true });
 * });
 */
export function defineContracts(
  build: (ctx: CollectorContext) => void,
): RuleSet {
  const states = new Map<string, ContractState>();
  let frozen = false;

  const contract = (name: string, from: string): ContractBuilder => {
    if (frozen) {
      throw new Error(
        `defineContracts: contract("${name}") called after the collector ` +
          "callback returned.",
      );
    }

    if (states.has(subjectKey(name, from))) {
      throw new Error(
        `defineContracts: duplicate contract for "${name}" under gate ` +
          `"${from}" — one component, one contract.`,
      );
    }

    const state: ContractState = {
      name,
      from,
      slots: undefined,
      loose: false,
      strictAnalysis: false,
      props: undefined,
      requiresAnyOf: [],
      descendants: undefined,
      forbidDescendants: [],
      forbidDescendantProps: [],
      notInside: [],
      deprecated: undefined,
      branches: [],
    };

    states.set(subjectKey(name, from), state);

    return makeBuilder(state, () => frozen);
  };

  build({ contract });
  frozen = true;

  return makeRuleSet(compileStates([...states.values()]));
}
