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

import type { ContractRows, Slot, SlotsRow } from "@jsx-contracts/core";
import { displayName } from "@jsx-contracts/core";

import type {
  BaseSection,
  ContractDescription,
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

function describeBase(row: SlotsRow): BaseSection {
  const byAlias = new Map(
    row.slots.map((slot) => [slot.alias, displayName(slot.match)]),
  );

  const excludes = excludesByName(row, byAlias);

  const slots = row.slots.map((slot): DescribedSlot => {
    const name = displayName(slot.match);
    const described: DescribedSlot = { name };

    const bounds = boundsOf(slot);

    if (bounds !== undefined) {
      described.bounds = bounds;
    }

    const requires = resolveRefs(slot.requires ?? [], byAlias);

    if (requires.length > 0) {
      described.requires = requires;
    }

    const excluded = excludes.get(name) ?? [];

    if (excluded.length > 0) {
      described.excludes = excluded;
    }

    return described;
  });

  return { closed: row.closed, slots };
}

/**
 * Groups rows by subject and describes each. Only the children facet feeds the
 * base section today; other facets and branches join it additively as later
 * ADR 0006 tickets land, so a subject with no children facet contributes no
 * entry yet rather than an empty one.
 */
export function describeContract(rows: ContractRows): ContractDescription {
  const contracts: DescribedContract[] = [];

  for (const row of rows) {
    if (row.facet !== "slots") {
      continue;
    }

    contracts.push({
      subject: displayName(row.match),
      base: describeBase(row),
    });
  }

  return { contracts };
}
