/**
 * `describeContract(rows) → ContractDescription`: the compiled rows the linter
 * enforces, rendered as the public description IR (ADR 0006). Reading from rows
 * rather than builder objects is what keeps documentation from drifting away
 * from enforcement.
 *
 * The format lives in `@jsx-contracts/core`: the `MatchKey` shape and its
 * `displayName` reader come from there, so documentation and enforcement read
 * the same names.
 */

import type {
  ContractRows,
  Slot,
  SlotBranch,
  SlotsRow,
} from "@jsx-contracts/core";
import { displayName } from "@jsx-contracts/core";

import type {
  BaseSection,
  ContractDescription,
  DescribedBranch,
  DescribedContract,
  DescribedSlot,
  SlotBounds,
} from "./description.js";

function boundsOf(slot: Slot): SlotBounds | undefined {
  const { count } = slot;

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

  const bounds = boundsOf(slot);

  if (bounds !== undefined) {
    described.bounds = bounds;
  }

  const requires = resolveRefs(slot.requires ?? [], byAlias);

  if (requires.length > 0) {
    described.requires = requires;
  }

  return described;
}

function describeBase(
  row: SlotsRow,
  byAlias: Map<string, string>,
): BaseSection {
  const excludes = excludesByName(row, byAlias);

  const slots = row.slots.map((slot): DescribedSlot => {
    const described = describeSlot(slot, byAlias);
    const excluded = excludes.get(described.name) ?? [];

    if (excluded.length > 0) {
      described.excludes = excluded;
    }

    return described;
  });

  return { closed: row.closed, slots };
}

/**
 * A branch as its delta: condition AST, the slots it forbids/requires/extends
 * (aliases resolved to display names), and `because` verbatim. An extend entry
 * can name a new alias, so its own vocabulary widens the alias map before its
 * forbid/require references resolve.
 */
function describeBranch(
  branch: SlotBranch,
  byAlias: Map<string, string>,
): DescribedBranch {
  const aliases = new Map(byAlias);

  for (const slot of branch.extend ?? []) {
    aliases.set(slot.alias, displayName(slot.match));
  }

  const described: DescribedBranch = { when: branch.when };

  if (branch.because !== undefined) {
    described.because = branch.because;
  }

  if (branch.extend !== undefined && branch.extend.length > 0) {
    described.extend = branch.extend.map((slot): DescribedSlot => {
      const extended = describeSlot(slot, aliases);
      const excluded = resolveRefs(slot.excludes ?? [], aliases);

      if (excluded.length > 0) {
        extended.excludes = excluded;
      }

      return extended;
    });
  }

  const forbids = resolveRefs(branch.forbidSlots ?? [], aliases);

  if (forbids.length > 0) {
    described.forbids = forbids;
  }

  const requires = resolveRefs(branch.requireSlots ?? [], aliases);

  if (requires.length > 0) {
    described.requires = requires;
  }

  return described;
}

/**
 * Groups rows by subject and describes each. Only the children facet feeds the
 * base section and its branch deltas today; other facets join additively as
 * later ADR 0006 tickets land, so a subject with no children facet contributes
 * no entry yet rather than an empty one.
 */
export function describeContract(rows: ContractRows): ContractDescription {
  const contracts: DescribedContract[] = [];

  for (const row of rows) {
    if (row.facet !== "slots") {
      continue;
    }

    const byAlias = new Map(
      row.slots.map((slot) => [slot.alias, displayName(slot.match)]),
    );

    const contract: DescribedContract = {
      subject: displayName(row.match),
      base: describeBase(row, byAlias),
    };

    if (row.branches !== undefined && row.branches.length > 0) {
      contract.branches = row.branches.map((branch) =>
        describeBranch(branch, byAlias),
      );
    }

    contracts.push(contract);
  }

  return { contracts };
}
