/**
 * `describeContract(rows) → ContractDescription`: the compiled rows the linter
 * enforces, rendered as the public description IR (ADR 0006). Reading from rows
 * rather than builder objects is what keeps documentation from drifting away
 * from enforcement.
 *
 * Rows are grouped by subject identity, so every facet a contract declares —
 * children, props, descendants, the component-level verbs — folds into one
 * `DescribedContract`. A single authored `when` the compiler split across facet
 * rows is reunited into one branch delta here, keyed by its condition.
 *
 * The format lives in `@jsx-contracts/core`: the `MatchKey` shape, its
 * `displayName` reader and `matchKeyId` are from there, so documentation and
 * enforcement read the same names and group by the same identity.
 */

import type {
  ContractRow,
  ContractRows,
  Count,
  Forbidden,
  PropSpec,
  PropsRow,
  Slot,
  SlotBranch,
  SlotsRow,
  SubtreeRow,
  When,
} from "@jsx-contracts/core";
import { displayName, matchKeyId } from "@jsx-contracts/core";

import type {
  BaseSection,
  ChildrenSection,
  ContractDescription,
  Deprecation,
  DescribedBranch,
  DescribedContract,
  DescribedDescendant,
  DescribedProp,
  DescribedSlot,
  SlotBounds,
} from "./description.js";

function boundsOf(count: Count | undefined): SlotBounds | undefined {
  if (count === undefined) {
    return undefined;
  }

  const { min, max } = count;

  if (min !== undefined && max !== undefined) {
    return min === max
      ? { kind: "exactly", count: min }
      : { kind: "between", min, max };
  }

  if (min !== undefined) {
    return { kind: "atLeast", count: min };
  }

  if (max !== undefined) {
    return { kind: "atMost", count: max };
  }

  return undefined;
}

/**
 * Resolves sibling aliases to display names, dropping any that name no declared
 * slot and de-duplicating — the same contraction the engine's bounds check does.
 */
function resolveRefs(
  aliases: string[],
  byAlias: Map<string, string>,
): string[] {
  const names: string[] = [];

  for (const alias of aliases) {
    const name = byAlias.get(alias);

    if (name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

/**
 * `excludes` is authored per member; symmetry is computed (A excludes B ⇒ B
 * excludes A), so N-way groups fall out of per-member declarations. Folded here
 * once so every consumer sees the whole clique on each slot.
 */
function excludesByName(
  row: SlotsRow,
  byAlias: Map<string, string>,
): Map<string, string[]> {
  const sets = new Map<string, Set<string>>();
  const ensure = (name: string): Set<string> => {
    let set = sets.get(name);

    if (set === undefined) {
      set = new Set<string>();
      sets.set(name, set);
    }

    return set;
  };

  for (const slot of row.slots) {
    const name = displayName(slot.match);

    for (const other of resolveRefs(slot.excludes ?? [], byAlias)) {
      if (other === name) {
        continue;
      }

      ensure(name).add(other);
      ensure(other).add(name);
    }
  }

  return new Map([...sets].map(([name, set]) => [name, [...set]]));
}

/**
 * The name/bounds/requires shared by base slots and branch-extend slots.
 * `excludes` is added by the caller: at base level it is the folded symmetric
 * clique, inside a branch it is the delta's own per-member references.
 */
function describeSlot(slot: Slot, byAlias: Map<string, string>): DescribedSlot {
  const described: DescribedSlot = { name: displayName(slot.match) };

  const bounds = boundsOf(slot.count);

  if (bounds !== undefined) {
    described.bounds = bounds;
  }

  const requires = resolveRefs(slot.requires ?? [], byAlias);

  if (requires.length > 0) {
    described.requires = requires;
  }

  return described;
}

/** A prop spec passed through verbatim: names, never identity, symmetry not folded. */
function describeProp(spec: PropSpec): DescribedProp {
  const described: DescribedProp = { name: spec.prop };

  if (spec.required === true) {
    described.required = true;
  }

  if (spec.requires !== undefined && spec.requires.length > 0) {
    described.requires = spec.requires;
  }

  if (spec.excludes !== undefined && spec.excludes.length > 0) {
    described.excludes = spec.excludes;
  }

  if (spec.deprecated !== undefined) {
    described.deprecated = describeDeprecation(spec.deprecated);
  }

  return described;
}

function describeDeprecation(hint: { useInstead?: string }): Deprecation {
  return hint.useInstead === undefined ? {} : { useInstead: hint.useInstead };
}

function forbiddenNames(forbidden: Forbidden[]): string[] {
  return forbidden.map((entry) => displayName(entry.match));
}

function describeChildren(
  row: SlotsRow,
  byAlias: Map<string, string>,
): ChildrenSection {
  const excludes = excludesByName(row, byAlias);

  const slots = row.slots.map((slot): DescribedSlot => {
    const described = describeSlot(slot, byAlias);
    const excluded = excludes.get(described.name) ?? [];

    if (excluded.length > 0) {
      described.excludes = excluded;
    }

    return described;
  });

  const children: ChildrenSection = { closed: row.closed, slots };

  if (row.strictAnalysis === true) {
    children.strictAnalysis = true;
  }

  return children;
}

function describeBase(
  rowsBySubject: RowsBySubject,
  byAlias: Map<string, string>,
): BaseSection {
  const base: BaseSection = {};
  const { slots, props, subtree, ancestor } = rowsBySubject;

  if (slots !== undefined) {
    base.children = describeChildren(slots, byAlias);
  }

  if (props !== undefined && props.props.length > 0) {
    base.props = props.props.map(describeProp);
  }

  if (props?.requiresAnyOf !== undefined && props.requiresAnyOf.length > 0) {
    base.requiresAnyOf = props.requiresAnyOf.map((group) => [...group]);
  }

  if (subtree !== undefined && subtree.descendants.length > 0) {
    base.descendants = subtree.descendants.map((d): DescribedDescendant => {
      const described: DescribedDescendant = { name: displayName(d.match) };
      const bounds = boundsOf(d.count);

      if (bounds !== undefined) {
        described.bounds = bounds;
      }

      return described;
    });
  }

  if (subtree !== undefined && subtree.forbidDescendants.length > 0) {
    base.forbidsDescendants = forbiddenNames(subtree.forbidDescendants);
  }

  if (subtree !== undefined && subtree.forbidDescendantProps.length > 0) {
    base.forbidsDescendantProps = [...subtree.forbidDescendantProps];
  }

  if (ancestor !== undefined && ancestor.notInside.length > 0) {
    base.notInside = forbiddenNames(ancestor.notInside);
  }

  if (ancestor?.deprecated !== undefined) {
    base.deprecated = describeDeprecation(ancestor.deprecated);
  }

  return base;
}

/**
 * Reunites the branches the compiler split across facet rows: one authored `when`
 * becomes a slots branch, a props branch and a subtree branch that share a
 * condition, and here they fold back into one delta keyed by that condition.
 * Order is first-seen, so declaration order within a facet is preserved and the
 * children facet leads.
 */
function describeBranches(
  rowsBySubject: RowsBySubject,
  byAlias: Map<string, string>,
): DescribedBranch[] | undefined {
  const branches: DescribedBranch[] = [];
  const byCondition = new Map<string, DescribedBranch>();

  const branchFor = (
    when: When,
    because: string | undefined,
  ): DescribedBranch => {
    const key = JSON.stringify(when);
    const existing = byCondition.get(key);

    if (existing !== undefined) {
      if (existing.because === undefined && because !== undefined) {
        existing.because = because;
      }

      return existing;
    }

    const branch: DescribedBranch = { when };

    if (because !== undefined) {
      branch.because = because;
    }

    byCondition.set(key, branch);
    branches.push(branch);

    return branch;
  };

  for (const slotBranch of rowsBySubject.slots?.branches ?? []) {
    applySlotDelta(
      branchFor(slotBranch.when, slotBranch.because),
      slotBranch,
      byAlias,
    );
  }

  for (const propsBranch of rowsBySubject.props?.branches ?? []) {
    const branch = branchFor(propsBranch.when, propsBranch.because);

    if (propsBranch.props.length > 0) {
      branch.props = propsBranch.props.map(describeProp);
    }
  }

  for (const subtreeBranch of rowsBySubject.subtree?.branches ?? []) {
    const branch = branchFor(subtreeBranch.when, subtreeBranch.because);
    const forbids = forbiddenNames(subtreeBranch.forbidDescendants ?? []);

    if (forbids.length > 0) {
      branch.forbidsDescendants = forbids;
    }

    if (
      subtreeBranch.forbidDescendantProps !== undefined &&
      subtreeBranch.forbidDescendantProps.length > 0
    ) {
      branch.forbidsDescendantProps = [...subtreeBranch.forbidDescendantProps];
    }
  }

  return branches.length === 0 ? undefined : branches;
}

/**
 * The slots delta: an extend entry can name a new alias, so its own vocabulary
 * widens the alias map before its forbid/require references resolve.
 */
function applySlotDelta(
  branch: DescribedBranch,
  slotBranch: SlotBranch,
  byAlias: Map<string, string>,
): void {
  const aliases = new Map(byAlias);

  for (const slot of slotBranch.extend ?? []) {
    aliases.set(slot.alias, displayName(slot.match));
  }

  if (slotBranch.extend !== undefined && slotBranch.extend.length > 0) {
    branch.extend = slotBranch.extend.map((slot): DescribedSlot => {
      const extended = describeSlot(slot, aliases);
      const excluded = resolveRefs(slot.excludes ?? [], aliases);

      if (excluded.length > 0) {
        extended.excludes = excluded;
      }

      return extended;
    });
  }

  const forbids = resolveRefs(slotBranch.forbidSlots ?? [], aliases);

  if (forbids.length > 0) {
    branch.forbids = forbids;
  }

  const requires = resolveRefs(slotBranch.requireSlots ?? [], aliases);

  if (requires.length > 0) {
    branch.requires = requires;
  }
}

interface RowsBySubject {
  subject: string;
  slots?: SlotsRow;
  props?: PropsRow;
  subtree?: SubtreeRow;
  ancestor?: Extract<ContractRow, { facet: "ancestor" }>;
}

/**
 * Groups rows by subject identity (`matchKeyId`, so two gates on the same display
 * name stay apart) in first-seen order. Every facet folds into the one contract.
 */
function groupBySubject(rows: ContractRows): RowsBySubject[] {
  const groups: RowsBySubject[] = [];
  const byId = new Map<string, RowsBySubject>();

  for (const row of rows) {
    const id = matchKeyId(row.match);
    let group = byId.get(id);

    if (group === undefined) {
      group = { subject: displayName(row.match) };
      byId.set(id, group);
      groups.push(group);
    }

    switch (row.facet) {
      case "slots":
        group.slots = row;
        break;

      case "props":
        group.props = row;
        break;

      case "subtree":
        group.subtree = row;
        break;

      case "ancestor":
        group.ancestor = row;
        break;
    }
  }

  return groups;
}

export function describeContract(rows: ContractRows): ContractDescription {
  const contracts = groupBySubject(rows).map((group): DescribedContract => {
    const byAlias = new Map(
      (group.slots?.slots ?? []).map((slot) => [
        slot.alias,
        displayName(slot.match),
      ]),
    );

    const contract: DescribedContract = {
      subject: group.subject,
      base: describeBase(group, byAlias),
    };

    const branches = describeBranches(group, byAlias);

    if (branches !== undefined) {
      contract.branches = branches;
    }

    return contract;
  });

  return { contracts };
}
