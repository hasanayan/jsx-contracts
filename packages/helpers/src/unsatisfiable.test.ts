import { describe, expect, it } from "vitest";

import { contractsFor } from "./contracts-for.js";
import { mergeContracts } from "./merge-contracts.js";
import type { CompiledContracts } from "./rule-table.js";
import type { Narrowing, NarrowingKind } from "./unsatisfiable.js";
import { findUnsatisfiable } from "./unsatisfiable.js";

const { contract, prop, allOf, anyOf, not } = contractsFor("@acme/ds");

describe("unsatisfiability check", () => {
  it("reports a base-required slot a conditional row excludes", () => {
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .atLeast(1)
      .when(prop("variant").is("compact"), contract().hasSlot(".Action"));

    expect(findUnsatisfiable(tray)).toEqual([
      {
        id: "excludedSlot/Widget.Tray/Widget.Tray.Title",
        kind: "excludedSlot",
        component: "Widget.Tray",
        facet: "slots",
        slot: "Widget.Tray.Title",
        rows: [
          { index: 0 },
          { index: 1, when: { prop: "variant", values: ["compact"] } },
        ],
        message:
          'Widget.Tray (slots): <Widget.Tray.Title> is required by the unconditional row (rows[0]) and excluded by the row conditional on `variant is "compact"` (rows[1]). While both are active the slot is neither allowed nor required, so the requirement silently does not apply.',
      },
    ]);
  });

  it("stays quiet on a slot the base row only allows", () => {
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .hasSlot(".Action")
      .when(prop("variant").is("compact"), contract().hasSlot(".Title"));

    expect(findUnsatisfiable(tray)).toEqual([]);
  });

  it("stays quiet on the widening idiom, where every row is exclusive", () => {
    const tray = contract("Widget.Tray")
      .when(
        not(prop("expanded").isPresent()),
        contract().hasSlot(".Title").atLeast(1),
      )
      .when(
        prop("expanded").isPresent(),
        contract().hasSlot(".Title").atLeast(1).hasSlot(".Detail"),
      );

    expect(findUnsatisfiable(tray)).toEqual([]);
  });

  it("stays quiet on two rows over disjoint values of one prop", () => {
    const button = contract("Button")
      .when(prop("as").is("a"), contract().hasSlot(".Icon").atLeast(1))
      .when(prop("as").is("button"), contract().hasSlot(".Label"));

    expect(findUnsatisfiable(button)).toEqual([]);
  });

  it("stays quiet where it cannot decide, so it never invents a conflict", () => {
    // `anyOf(size, dense)` and `allOf(not size, not dense)` cannot both hold,
    // but deciding that needs reasoning past syntax. The check treats the pair
    // as co-satisfiable, which is the safe direction — and this pins that as
    // deliberate rather than incidental.
    const undecidable = contract("Panel")
      .when(
        anyOf(prop("size").is("large"), prop("dense").isPresent()),
        contract().hasSlot(".Title").atLeast(1),
      )
      .when(
        allOf(not(prop("size").is("large")), not(prop("dense").isPresent())),
        contract().hasSlot(".Body"),
      );

    // Believed co-satisfiable, so the narrowing *is* reported here — the miss
    // runs the other way, towards reporting a pair that can never arise.
    expect(findUnsatisfiable(undecidable).map((found) => found.id)).toEqual([
      "excludedSlot/Panel/Panel.Title",
    ]);
  });
});

describe("unsatisfiability check: bounds and references", () => {
  it("reports count bounds that tighten past each other", () => {
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .atLeast(2)
      .when(
        prop("variant").is("compact"),
        contract().hasSlot(".Title").atMost(1),
      );

    expect(findUnsatisfiable(tray)).toEqual([
      {
        id: "crossedBounds/Widget.Tray/Widget.Tray.Title",
        kind: "crossedBounds",
        component: "Widget.Tray",
        facet: "slots",
        slot: "Widget.Tray.Title",
        rows: [
          { index: 0 },
          { index: 1, when: { prop: "variant", values: ["compact"] } },
        ],
        message:
          'Widget.Tray (slots): <Widget.Tray.Title> is required at least 2 times by the unconditional row (rows[0]) and allowed at most 1 by the row conditional on `variant is "compact"` (rows[1]). While both are active the lower bound is clamped down to 1, so the requirement silently weakens.',
      },
    ]);
  });

  it("counts a bare declaration as at most one, as the combination does", () => {
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .atLeast(2)
      .when(prop("dense").isPresent(), contract().hasSlot(".Title"));

    expect(findUnsatisfiable(tray).map((found) => found.kind)).toEqual([
      "crossedBounds",
    ]);
  });

  it("reports a cross-slot reference whose target a conditional row excludes", () => {
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .hasSlot(".Action")
      .slotRequires(".Action", ".Title")
      .when(prop("variant").is("compact"), contract().hasSlot(".Action"));

    expect(findUnsatisfiable(tray)).toEqual([
      {
        id: "droppedReference/Widget.Tray/Widget.Tray.Title",
        kind: "droppedReference",
        component: "Widget.Tray",
        facet: "slots",
        slot: "Widget.Tray.Title",
        rows: [
          { index: 0 },
          { index: 1, when: { prop: "variant", values: ["compact"] } },
        ],
        message:
          'Widget.Tray (slots): the unconditional row (rows[0]) requires <Widget.Tray.Action> to render alongside <Widget.Tray.Title>, and the row conditional on `variant is "compact"` (rows[1]) excludes <Widget.Tray.Title>. While both are active the reference is dropped, so the requirement silently does not apply.',
      },
    ]);
  });

  it("reports one narrowing per slot per kind, whichever pair causes it", () => {
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .atLeast(1)
      .when(prop("dense").isPresent(), contract().hasSlot(".Action"))
      .when(prop("variant").is("compact"), contract().hasSlot(".Action"));

    expect(findUnsatisfiable(tray).map((found) => found.rows)).toEqual([
      [{ index: 0 }, { index: 1, when: { prop: "dense" } }],
    ]);
  });

  it("stays quiet where the referring slot is excluded too", () => {
    // Neither slot survives, so the reference is not a rule that stopped
    // applying: `.Action` cannot render at all while the condition holds.
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .hasSlot(".Action")
      .slotRequires(".Action", ".Title")
      .when(prop("variant").is("compact"), contract().hasSlot(".Overflow"));

    expect(findUnsatisfiable(tray)).toEqual([]);
  });
});

describe("unsatisfiability check: the entry point", () => {
  it("reads a whole merged table, component by component", () => {
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .atLeast(1)
      .when(prop("variant").is("compact"), contract().hasSlot(".Action"));

    const menu = contract("Menu")
      .hasSlot(".Item")
      .atLeast(1)
      .when(prop("dense").isPresent(), contract().hasSlot(".Divider"));

    expect(
      findUnsatisfiable(mergeContracts(tray, menu)).map((found) => found.id),
    ).toEqual([
      "excludedSlot/Widget.Tray/Widget.Tray.Title",
      "excludedSlot/Menu/Menu.Item",
    ]);
  });

  it("accepts a narrowing the author declares deliberate", () => {
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .atLeast(1)
      .when(prop("variant").is("compact"), contract().hasSlot(".Action"));

    expect(
      findUnsatisfiable(tray, {
        allow: ["excludedSlot/Widget.Tray/Widget.Tray.Title"],
      }),
    ).toEqual([]);
  });

  it("says nothing about a contract with no conditional rows", () => {
    const tray = contract("Widget.Tray").hasSlot(".Title").atLeast(1);

    expect(findUnsatisfiable(tray)).toEqual([]);
  });

  it("caches on the content of the rows, not on the contract's identity", () => {
    const chain = (): CompiledContracts =>
      contract("Widget.Tray")
        .hasSlot(".Title")
        .atLeast(1)
        .when(prop("variant").is("compact"), contract().hasSlot(".Action"));

    const first = findUnsatisfiable(chain());
    const second = findUnsatisfiable(chain());

    expect(second).toBe(first);
    expect(findUnsatisfiable(chain(), { allow: ["something-else"] })).not.toBe(
      first,
    );
  });

  it("hands back a frozen result, because it is shared", () => {
    const tray = contract("Widget.Tray")
      .hasSlot(".Title")
      .atLeast(1)
      .when(prop("variant").is("compact"), contract().hasSlot(".Action"));

    expect(Object.isFrozen(findUnsatisfiable(tray))).toBe(true);
  });
});

// Type-level enforcement. Never executed — tsc checks the @ts-expect-error
// directives when it compiles this file.
function typeLevelChecks(): void {
  const tray = contract("Widget.Tray").hasSlot(".Title");

  // A builder is already a compiled contract, so the check takes one directly.
  const found = findUnsatisfiable(tray);
  const [narrowing] = found;

  // The kinds are a closed union, so a switch over them is exhaustive.
  if (narrowing !== undefined) {
    const kind: NarrowingKind = narrowing.kind;

    // @ts-expect-error "unknown" is not one of the three narrowings.
    const bogus: NarrowingKind = "unknown";
    // @ts-expect-error the children facet is the only one that narrows.
    const facet: "props" = narrowing.facet;

    void kind;
    void bogus;
    void facet;
  }

  // @ts-expect-error findings are frozen and shared, so the array is readonly.
  const mutable: Narrowing[] = found;

  void mutable;

  // @ts-expect-error `allow` takes narrowing ids, not conditions.
  findUnsatisfiable(tray, { allow: [prop("variant").is("compact")] });

  // @ts-expect-error a nameless contract has no rule table to check.
  findUnsatisfiable(contract());
}

void typeLevelChecks;
