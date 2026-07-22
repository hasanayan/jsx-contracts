// Seam 1: descendants, subtree bans, notInside and deprecated → rows. Dotted
// shorthands expand uniformly across every facet that accepts names, which the
// old emit path silently skipped.

import { describe, expect, it } from "vitest";

import type { ContractRow, Facet } from "@jsx-contracts/core";

import { prop } from "./conditions.js";
import { defineContracts } from "./define-contracts.js";

const FROM = "~/components/Card.tsx";

function rowOf<F extends Facet>(
  build: Parameters<typeof defineContracts>[0],
  facet: F,
): Extract<ContractRow, { facet: F }> {
  const row = defineContracts(build).rows.find(
    (candidate) => candidate.facet === facet,
  );

  if (row === undefined) {
    throw new Error(`expected a ${facet} row`);
  }

  return row as Extract<ContractRow, { facet: F }>;
}

describe("dotted-shorthand expansion is uniform across facets", () => {
  it("expands a dotted name to the subject identically everywhere", () => {
    const build: Parameters<typeof defineContracts>[0] = ({ contract }) => {
      contract("Card", FROM)
        .slots({
          ".Body": true,
          ".Icon": (s) => s.excludes(".Avatar"),
          ".Avatar": true,
        })
        .descendants({ ".Item": true })
        .forbidDescendants(".Actions")
        .notInside(".Dialog");
    };

    const slots = rowOf(build, "slots");
    const subtree = rowOf(build, "subtree");
    const ancestor = rowOf(build, "ancestor");

    // slots key
    expect(slots.slots[0]?.match.name).toBe("Card.Body");
    // requires/excludes: the alias is stored verbatim, and the sibling it names
    // carries the expanded identity — the same expansion, resolved by the engine.
    expect(slots.slots[1]?.excludes).toEqual([".Avatar"]);
    expect(slots.slots[2]?.match.name).toBe("Card.Avatar");
    // descendants key
    expect(subtree.descendants[0]?.match.name).toBe("Card.Item");
    // forbid list
    expect(subtree.forbidDescendants[0]?.match.name).toBe("Card.Actions");
    // notInside
    expect(ancestor.notInside[0]?.match.name).toBe("Card.Dialog");
  });

  it("leaves an intrinsic and a full name untouched everywhere", () => {
    const subtree = rowOf(({ contract }) => {
      contract("Card", FROM)
        .forbidDescendants("button", "Dialog.Panel")
        .descendants({ li: true, Row: (d) => d.is("Table.Row") });
    }, "subtree");

    expect(subtree.forbidDescendants.map((entry) => entry.match.name)).toEqual([
      "button",
      "Dialog.Panel",
    ]);

    expect(subtree.descendants.map((entry) => entry.match.name)).toEqual([
      "li",
      "Table.Row",
    ]);
  });
});

describe("forbidDescendants — all four entry forms", () => {
  it("compiles intrinsic, dotted shorthand, full name, and self-gated", () => {
    const subtree = rowOf(({ contract }) => {
      contract("Card", FROM).forbidDescendants(
        "button",
        ".Actions",
        "Dialog.Panel",
        { name: "Tooltip", from: "@acme/ui" },
      );
    }, "subtree");

    expect(subtree.forbidDescendants).toEqual([
      { match: { kind: "name", name: "button" } },
      { match: { kind: "name", name: "Card.Actions", from: FROM } },
      { match: { kind: "name", name: "Dialog.Panel" } },
      { match: { kind: "name", name: "Tooltip", from: "@acme/ui" } },
    ]);
  });

  it("expands a dotted name inside a self-gated entry too", () => {
    const subtree = rowOf(({ contract }) => {
      contract("Card", FROM).forbidDescendants({ name: ".Footer", from: FROM });
    }, "subtree");

    expect(subtree.forbidDescendants).toEqual([
      { match: { kind: "name", name: "Card.Footer", from: FROM } },
    ]);
  });
});

describe("descendants map → subtree row", () => {
  it("records the triple model and count bounds", () => {
    const subtree = rowOf(({ contract }) => {
      contract("Tabs", FROM).descendants({
        ".Tab": (d) => d.min(1),
        ".Panel": (d) => d.exactly(2),
        ".Bare": true,
      });
    }, "subtree");

    expect(subtree.descendants).toEqual([
      {
        alias: ".Tab",
        match: { kind: "name", name: "Tabs.Tab", from: FROM },
        count: { min: 1 },
      },
      {
        alias: ".Panel",
        match: { kind: "name", name: "Tabs.Panel", from: FROM },
        count: { min: 2, max: 2 },
      },
      {
        alias: ".Bare",
        match: { kind: "name", name: "Tabs.Bare", from: FROM },
      },
    ]);
  });

  it("throws when descendants is declared twice", () => {
    expect(() => {
      defineContracts(({ contract }) => {
        contract("Tabs", FROM)
          .descendants({ ".Tab": true })
          .descendants({ ".Panel": true });
      });
    }).toThrow(/declares descendants twice/);
  });

  it("rejects a double-bound dotted descendant key", () => {
    expect(() => {
      defineContracts(({ contract }) => {
        contract("Tabs", FROM).descendants({ ".Tab": (d) => d.is("Tabs.Tab") });
      });
    }).toThrow(/binds its identity twice/);
  });
});

describe("forbidDescendantProps", () => {
  it("records the forbidden props on the subtree row", () => {
    const subtree = rowOf(({ contract }) => {
      contract("Card", FROM).forbidDescendantProps("onClick", "href");
    }, "subtree");

    expect(subtree.forbidDescendantProps).toEqual(["onClick", "href"]);
  });
});

describe("notInside and deprecated → ancestor row", () => {
  it("records forbidden ancestors and the deprecation hint", () => {
    const ancestor = rowOf(({ contract }) => {
      contract("Card", FROM).notInside("Table", ".Body").deprecated("Panel");
    }, "ancestor");

    expect(ancestor.notInside).toEqual([
      { match: { kind: "name", name: "Table" } },
      { match: { kind: "name", name: "Card.Body", from: FROM } },
    ]);

    expect(ancestor.deprecated).toEqual({ useInstead: "Panel" });
  });

  it("deprecated with no replacement carries an empty hint", () => {
    const ancestor = rowOf(({ contract }) => {
      contract("Card", FROM).deprecated();
    }, "ancestor");

    expect(ancestor.deprecated).toEqual({});
    expect(ancestor.notInside).toEqual([]);
  });

  it("throws when deprecated is declared twice", () => {
    expect(() => {
      defineContracts(({ contract }) => {
        contract("Card", FROM).deprecated().deprecated("Panel");
      });
    }).toThrow(/declares deprecated twice/);
  });
});

describe("subtree bans as a branch delta", () => {
  it("routes forbidDescendants and forbidDescendantProps to subtree branches", () => {
    const subtree = rowOf(({ contract }) => {
      contract("Card", FROM).when(
        prop("onClick").isPresent(),
        (c) => c.forbidDescendants(".Footer").forbidDescendantProps("tabIndex"),
        { because: "A clickable card is a leaf." },
      );
    }, "subtree");

    expect(subtree.descendants).toEqual([]);
    expect(subtree.branches).toEqual([
      {
        when: { prop: "onClick" },
        because: "A clickable card is a leaf.",
        forbidDescendants: [
          { match: { kind: "name", name: "Card.Footer", from: FROM } },
        ],
        forbidDescendantProps: ["tabIndex"],
      },
    ]);
  });

  it("splits a branch that changes slots and subtree bans across two rows", () => {
    const rows = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true, ".Footer": true })
        .when(prop("onClick").isPresent(), (c) =>
          c.forbidSlot(".Footer").forbidDescendants("button"),
        );
    }).rows;

    const slots = rows.find((row) => row.facet === "slots");
    const subtree = rows.find((row) => row.facet === "subtree");

    expect(slots?.facet === "slots" ? slots.branches : undefined).toEqual([
      { when: { prop: "onClick" }, forbidSlots: [".Footer"] },
    ]);

    expect(subtree?.facet === "subtree" ? subtree.branches : undefined).toEqual(
      [
        {
          when: { prop: "onClick" },
          forbidDescendants: [{ match: { kind: "name", name: "button" } }],
        },
      ],
    );
  });
});
