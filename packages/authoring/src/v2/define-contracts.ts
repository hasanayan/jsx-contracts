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
  AncestorRowV2,
  ContractRowsV2,
  DescendantV2,
  ForbiddenV2,
  PropDeprecationV2,
  PropSpecV2,
  PropsBranchV2,
  PropsRowV2,
  SlotBranchV2,
  SlotV2,
  SlotsRowV2,
  SubtreeBranchV2,
  SubtreeRowV2,
} from "@jsx-contracts/eslint-plugin";

import type { Condition } from "./conditions.js";

/** Severity of an emitted rule. */
export type Severity = "error" | "warn";

// The plugin's v2 rule ids. `authoring` stays type-only over the plugin, so the
// ids are restated here rather than imported.
const SLOTS_CLOSURE_ID = "@jsx-contracts/slots.closure";
const PROPS_CONTRACT_ID = "@jsx-contracts/props.contract";
const SUBTREE_CONTRACT_ID = "@jsx-contracts/subtree.contract";
const ANCESTOR_CONTRACT_ID = "@jsx-contracts/ancestor.contract";

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

/**
 * The spec-builder a props map entry receives. Every verb is local to the prop
 * it constrains and returns the builder, so specs read as one chain:
 * `(p) => p.required().excludes("onClick")`.
 *
 * Unlike a slot's siblings, `requires`/`excludes` name any prop — a co-prop
 * need not have its own map entry (`href` excludes `onClick` without declaring
 * it) — so these accept plain prop names.
 */
export interface PropSpecBuilder {
  /** The prop must be written on the element. */
  required(): PropSpecBuilder;
  /** The prop may only be written alongside each named prop. */
  requires(...props: string[]): PropSpecBuilder;
  /** The prop may not be written alongside any named prop. */
  excludes(...props: string[]): PropSpecBuilder;
  /** The prop is deprecated; `useInstead` names the replacement to hint at. */
  deprecated(useInstead?: string): PropSpecBuilder;
}

/**
 * A prop's spec: a callback given the spec-builder. Unlike a slot, there is no
 * `true` shorthand — a prop entry always states a constraint, and a
 * constraint-free entry is a config-time error.
 */
export type PropSpec = (spec: PropSpecBuilder) => PropSpecBuilder;

/** A props map: prop name → spec. */
export type PropsMap = Record<string, PropSpec>;

/**
 * The spec-builder a descendants map entry receives. The same triple model as a
 * slot (alias key, identity, bound spec) minus the sibling relations, which
 * only make sense among direct children: a descendant is bound by identity and
 * count, required somewhere below.
 */
export interface DescendantSpecBuilder {
  /**
   * Bind the descendant's identity. Required on a bare capitalized key; a
   * config-time error on a dotted key, which already implies its identity.
   */
  is(name: string, from?: string): DescendantSpecBuilder;
  /** The descendant must appear at least `count` times below the container. */
  min(count: number): DescendantSpecBuilder;
  /** The descendant may appear at most `count` times below the container. */
  max(count: number): DescendantSpecBuilder;
  /** The descendant must appear exactly `count` times below: both bounds at once. */
  exactly(count: number): DescendantSpecBuilder;
}

/**
 * A descendant's spec: `true` for an unbounded descendant (0–∞), or a callback
 * given the spec-builder. A dotted key already implies the descendant's
 * identity; `true` is `(d) => d.is("<key>")`.
 */
export type DescendantSpec =
  true | ((spec: DescendantSpecBuilder) => DescendantSpecBuilder);

/** A descendants map: alias key → spec. */
export type DescendantsMap = Record<string, DescendantSpec>;

/**
 * One entry of a `forbidDescendants` or `notInside` list. The four forms fold
 * into one shape: an intrinsic (`"button"`), a dotted shorthand (`".Actions"`,
 * expanded against the subject), a full name (`"Dialog.Panel"`), or a self-gated
 * `{ name, from }`. Every form runs the same dotted expansion.
 */
export type ForbidEntry = string | { name: string; from?: string };

/** One contract's accumulating state inside the collector. */
interface ContractState {
  readonly name: string;
  readonly from: string;
  slots: SlotV2[] | undefined;
  loose: boolean;
  props: PropSpecV2[] | undefined;
  requiresAnyOf: string[][];
  descendants: DescendantV2[] | undefined;
  forbidDescendants: ForbiddenV2[];
  forbidDescendantProps: string[];
  notInside: ForbiddenV2[];
  deprecated: PropDeprecationV2 | undefined;
  branches: BranchDraft[];
}

/**
 * One `when` call, recorded before it is split across facets. A branch can
 * change slots, props, or both; compilation routes its slot deltas to the slots
 * row's branches and its prop deltas to the props row's.
 */
interface BranchDraft {
  when: Condition["when"];
  because: string | undefined;
  forbidSlots: string[];
  requireSlots: string[];
  extend: SlotV2[];
  props: PropSpecV2[];
  forbidDescendants: ForbiddenV2[];
  forbidDescendantProps: string[];
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
  /**
   * Gate prop rules on the branch condition. The specs apply only while the
   * branch holds, and a violation one drives names the witness that turned it
   * on.
   */
  props: (map: PropsMap) => BranchDeltaBuilder;
  /**
   * Forbid elements anywhere below while the branch holds. Every entry form —
   * intrinsic, dotted shorthand, full name, self-gated `{ name, from }` — is
   * expanded against the subject like everywhere else.
   */
  forbidDescendants: (...entries: ForbidEntry[]) => BranchDeltaBuilder;
  /** Forbid descendants carrying any named prop while the branch holds. */
  forbidDescendantProps: (...props: string[]) => BranchDeltaBuilder;
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
   * Declare the component's props contract. The map is always loose — every
   * entry states a constraint, and a constraint-free entry is a config-time
   * error. Calling it twice throws — one component, one props map.
   *
   * A spec's `requires`/`excludes` name any prop, declared here or not.
   */
  props: (map: PropsMap) => ContractBuilderV2;
  /**
   * Require at least one of the named props to be present — the one
   * contract-level at-least-one-of verb. Each call adds one group.
   */
  requiresAnyOf: (...props: string[]) => ContractBuilderV2;
  /**
   * Declare elements required somewhere below the container — the same triple
   * model and bound specs as {@link slots}, but matched anywhere in the subtree.
   * Calling it twice throws — one component, one descendants map.
   */
  descendants: (map: DescendantsMap) => ContractBuilderV2;
  /**
   * Forbid elements anywhere below the container. Accepts all four entry forms —
   * intrinsic, dotted shorthand, full name, self-gated `{ name, from }` — each
   * dotted-expanded against the subject. Each call adds to the list.
   */
  forbidDescendants: (...entries: ForbidEntry[]) => ContractBuilderV2;
  /** Forbid any descendant carrying one of the named props. Adds to the list. */
  forbidDescendantProps: (...props: string[]) => ContractBuilderV2;
  /**
   * Forbid this component from rendering inside any of the named ancestors.
   * Accepts the same four entry forms as {@link forbidDescendants}.
   */
  notInside: (...ancestors: ForbidEntry[]) => ContractBuilderV2;
  /**
   * Mark this component deprecated; `useInstead` names the replacement to hint
   * at. Calling it twice throws — one component, one deprecation.
   */
  deprecated: (useInstead?: string) => ContractBuilderV2;
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

/** What one prop callback records before it is assembled into a row. */
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

/** A recording prop spec-builder: every verb writes to `draft` and chains. */
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

/** Assemble one prop row, or throw when the entry states no constraint. */
function buildPropSpec(prop: string, spec: PropSpec): PropSpecV2 {
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

  const row: PropSpecV2 = { prop };

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

function parseProps(map: PropsMap): PropSpecV2[] {
  return Object.entries(map).map(([prop, spec]) => buildPropSpec(prop, spec));
}

/**
 * Parse a descendants map. Reuses the slot key-form machinery — dotted implies
 * identity, bare capitalized must call `is()`, bare lowercase is an intrinsic,
 * the double-bind is an error — then drops the sibling relations a descendant
 * has no use for.
 */
function parseDescendants(
  map: DescendantsMap,
  subject: string,
): DescendantV2[] {
  return Object.entries(map).map(([alias, spec]) => {
    const slot = buildSlot(alias, spec as unknown as SlotSpec, subject);
    const descendant: DescendantV2 = { alias: slot.alias, match: slot.match };

    if (slot.from !== undefined) {
      descendant.from = slot.from;
    }

    if (slot.count !== undefined) {
      descendant.count = slot.count;
    }

    return descendant;
  });
}

/** Fold one forbid entry into its normalized shape, dotted-expanded on `subject`. */
function buildForbidden(entry: ForbidEntry, subject: string): ForbiddenV2 {
  const name = typeof entry === "string" ? entry : entry.name;
  const from = typeof entry === "string" ? undefined : entry.from;

  const forbidden: ForbiddenV2 = {
    match: { kind: "name", name: resolveName(name, subject) },
  };

  if (from !== undefined) {
    forbidden.from = from;
  }

  return forbidden;
}

/** Expand a forbid/notInside list uniformly against the subject. */
function parseForbidList(
  entries: ForbidEntry[],
  subject: string,
): ForbiddenV2[] {
  return entries.map((entry) => buildForbidden(entry, subject));
}

/** A recording delta builder: every verb writes to `draft` and chains. */
function deltaRecorder(
  draft: BranchDraft,
  subject: string,
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

/** Record one `when` call into a branch draft, shorthand expanded on `subject`. */
function buildBranch(
  condition: Condition,
  delta: BranchDelta,
  options: BranchOptions | undefined,
  subject: string,
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

/** The slot half of a branch, or `undefined` when it changes no slots. */
function slotBranchOf(draft: BranchDraft): SlotBranchV2 | undefined {
  if (
    draft.forbidSlots.length === 0 &&
    draft.requireSlots.length === 0 &&
    draft.extend.length === 0
  ) {
    return undefined;
  }

  const branch: SlotBranchV2 = { when: draft.when };

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

/** The props half of a branch, or `undefined` when it changes no props. */
function propsBranchOf(draft: BranchDraft): PropsBranchV2 | undefined {
  if (draft.props.length === 0) {
    return undefined;
  }

  const branch: PropsBranchV2 = { when: draft.when, props: draft.props };

  if (draft.because !== undefined) {
    branch.because = draft.because;
  }

  return branch;
}

/** The subtree half of a branch, or `undefined` when it forbids nothing below. */
function subtreeBranchOf(draft: BranchDraft): SubtreeBranchV2 | undefined {
  if (
    draft.forbidDescendants.length === 0 &&
    draft.forbidDescendantProps.length === 0
  ) {
    return undefined;
  }

  const branch: SubtreeBranchV2 = { when: draft.when };

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

function compileStates(states: ContractState[]): ContractRowsV2 {
  const rows: ContractRowsV2 = [];

  for (const state of states) {
    const slotBranches = state.branches
      .map(slotBranchOf)
      .filter((branch): branch is SlotBranchV2 => branch !== undefined);

    const propsBranches = state.branches
      .map(propsBranchOf)
      .filter((branch): branch is PropsBranchV2 => branch !== undefined);

    const subtreeBranches = state.branches
      .map(subtreeBranchOf)
      .filter((branch): branch is SubtreeBranchV2 => branch !== undefined);

    // A contract with neither a children map nor a slot-changing branch declares
    // no children facet — no slots row.
    if (state.slots !== undefined || slotBranches.length > 0) {
      const row: SlotsRowV2 = {
        facet: "slots",
        match: { kind: "name", name: state.name },
        slots: state.slots ?? [],
        closed: !state.loose,
      };

      if (slotBranches.length > 0) {
        row.branches = slotBranches;
      }

      rows.push(row);
    }

    // Likewise, a props row only when something states a prop rule.
    if (
      state.props !== undefined ||
      state.requiresAnyOf.length > 0 ||
      propsBranches.length > 0
    ) {
      const row: PropsRowV2 = {
        facet: "props",
        match: { kind: "name", name: state.name },
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

    // A subtree row only when something states a descendant rule — required,
    // forbidden, a forbidden prop, or a ban under a branch.
    if (
      state.descendants !== undefined ||
      state.forbidDescendants.length > 0 ||
      state.forbidDescendantProps.length > 0 ||
      subtreeBranches.length > 0
    ) {
      const row: SubtreeRowV2 = {
        facet: "subtree",
        match: { kind: "name", name: state.name },
        descendants: state.descendants ?? [],
        forbidDescendants: state.forbidDescendants,
        forbidDescendantProps: state.forbidDescendantProps,
      };

      if (subtreeBranches.length > 0) {
        row.branches = subtreeBranches;
      }

      rows.push(row);
    }

    // An ancestor row only when the component states a placement or lifecycle
    // rule: a forbidden ancestor or a deprecation.
    if (state.notInside.length > 0 || state.deprecated !== undefined) {
      const row: AncestorRowV2 = {
        facet: "ancestor",
        match: { kind: "name", name: state.name },
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

/** Wrap a v2 rule table as a `RuleSetV2` — the only way one is made. */
export function makeRuleSet(rows: ContractRowsV2): RuleSetV2 {
  return {
    rows,
    rules(
      severity: Severity = "error",
    ): Record<string, [Severity, ContractRowsV2]> {
      const entries: Record<string, [Severity, ContractRowsV2]> = {
        [SLOTS_CLOSURE_ID]: [severity, rows],
      };

      // Each non-slots rule ships only when a contract states its facet: every
      // rule filters the shared table to its own facet, so a facet-free table
      // needs no entry for it.
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
    props(map): ContractBuilderV2 {
      guard();

      if (state.props !== undefined) {
        throw new Error(
          `defineContracts: contract "${state.name}" declares props twice.`,
        );
      }

      state.props = parseProps(map);

      return builder;
    },
    requiresAnyOf(...props): ContractBuilderV2 {
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
    descendants(map): ContractBuilderV2 {
      guard();

      if (state.descendants !== undefined) {
        throw new Error(
          `defineContracts: contract "${state.name}" declares descendants twice.`,
        );
      }

      state.descendants = parseDescendants(map, state.name);

      return builder;
    },
    forbidDescendants(...entries): ContractBuilderV2 {
      guard();
      state.forbidDescendants.push(...parseForbidList(entries, state.name));

      return builder;
    },
    forbidDescendantProps(...props): ContractBuilderV2 {
      guard();
      state.forbidDescendantProps.push(...props);

      return builder;
    },
    notInside(...ancestors): ContractBuilderV2 {
      guard();
      state.notInside.push(...parseForbidList(ancestors, state.name));

      return builder;
    },
    deprecated(useInstead): ContractBuilderV2 {
      guard();

      if (state.deprecated !== undefined) {
        throw new Error(
          `defineContracts: contract "${state.name}" declares deprecated twice.`,
        );
      }

      state.deprecated = useInstead === undefined ? {} : { useInstead };

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
      props: undefined,
      requiresAnyOf: [],
      descendants: undefined,
      forbidDescendants: [],
      forbidDescendantProps: [],
      notInside: [],
      deprecated: undefined,
      branches: [],
    };

    states.set(name, state);

    return makeBuilder(state, () => frozen);
  };

  build({ contract });
  frozen = true;

  return makeRuleSet(compileStates([...states.values()]));
}
