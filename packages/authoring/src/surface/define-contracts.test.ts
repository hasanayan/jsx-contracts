// Seam 1: authored input → emitted rows.

import { describe, expect, it } from "vitest";

import type { SlotsRow } from "@jsx-contracts/core";

import { defineContracts } from "./define-contracts.js";
import { mergeContracts } from "./merge-contracts.js";

const CARD_FROM = "~/components/Card.tsx";

function onlyRow(rows: readonly unknown[]): SlotsRow {
  expect(rows).toHaveLength(1);

  return rows[0] as SlotsRow;
}

describe("defineContracts", () => {
  it("registers a contract on the contract() call and emits one slots row", () => {
    const set = defineContracts(({ contract }) => {
      contract("Card.Heading", CARD_FROM).slots({ ".Text": true });
    });

    const row = onlyRow(set.rows);

    expect(row.facet).toBe("slots");
    expect(row.match).toEqual({
      kind: "name",
      name: "Card.Heading",
      from: CARD_FROM,
    });
  });

  it("derives a dotted key's identity from the subject", () => {
    const set = defineContracts(({ contract }) => {
      contract("Card.Heading", CARD_FROM).slots({
        ".Text": true,
        ".Icon": (s) => s,
      });
    });

    const row = onlyRow(set.rows);

    expect(row.slots).toEqual([
      {
        alias: ".Text",
        match: { kind: "name", name: "Card.Heading.Text", from: CARD_FROM },
      },
      {
        alias: ".Icon",
        match: { kind: "name", name: "Card.Heading.Icon", from: CARD_FROM },
      },
    ]);
  });

  it("keeps a bare (intrinsic) key's identity as written", () => {
    const set = defineContracts(({ contract }) => {
      contract("List", CARD_FROM).slots({ li: true });
    });

    expect(onlyRow(set.rows).slots).toEqual([
      { alias: "li", match: { kind: "name", name: "li" } },
    ]);
  });

  it("closes the map by default and opens it with loose()", () => {
    const closed = defineContracts(({ contract }) => {
      contract("Card.Heading", CARD_FROM).slots({ ".Text": true });
    });

    const loose = defineContracts(({ contract }) => {
      contract("Card.Heading", CARD_FROM).slots({ ".Text": true }).loose();
    });

    expect(onlyRow(closed.rows).closed).toBe(true);
    expect(onlyRow(loose.rows).closed).toBe(false);
  });

  it("compiles strictAnalysis() to the slots row flag, off by default", () => {
    const lax = defineContracts(({ contract }) => {
      contract("Card.Heading", CARD_FROM).slots({ ".Text": true });
    });

    const strict = defineContracts(({ contract }) => {
      contract("Card.Heading", CARD_FROM)
        .slots({ ".Text": true })
        .strictAnalysis();
    });

    expect(onlyRow(lax.rows).strictAnalysis).toBeUndefined();
    expect(onlyRow(strict.rows).strictAnalysis).toBe(true);
  });

  it("throws when strictAnalysis() has no children map to ride", () => {
    expect(() =>
      defineContracts(({ contract }) => {
        contract("Card", CARD_FROM).strictAnalysis();
      }),
    ).toThrow(/strictAnalysis\(\) but declares no children/u);
  });

  it("emits no row for a contract that declares no children map", () => {
    const set = defineContracts(({ contract }) => {
      contract("Card", CARD_FROM);
    });

    expect(set.rows).toHaveLength(0);
  });

  it("throws on a duplicate component name under the same gate within the collector", () => {
    expect(() =>
      defineContracts(({ contract }) => {
        contract("Card", CARD_FROM);
        contract("Card", CARD_FROM);
      }),
    ).toThrow(
      /duplicate contract for "Card" under gate "~\/components\/Card\.tsx"/,
    );
  });

  it("registers one name under two gates as two subjects", () => {
    const set = defineContracts(({ contract }) => {
      contract("Button", "@acme/ds").props({ label: (p) => p.required() });
      contract("Button", "@other/ui").deprecated();
    });

    expect(set.rows.map((row) => [row.match.name, row.match.from])).toEqual([
      ["Button", "@acme/ds"],
      ["Button", "@other/ui"],
    ]);
  });

  it("throws when a contract declares slots twice", () => {
    expect(() =>
      defineContracts(({ contract }) => {
        contract("Card", CARD_FROM)
          .slots({ ".Text": true })
          .slots({ ".Icon": true });
      }),
    ).toThrow(/declares slots twice/);
  });

  it("freezes the rule set when the callback returns", () => {
    let escaped: ReturnType<typeof capture> | undefined;

    function capture(builder: {
      slots: (map: Record<string, true>) => unknown;
    }): typeof builder {
      return builder;
    }

    defineContracts(({ contract }) => {
      escaped = capture(contract("Card", CARD_FROM));
    });

    expect(() => escaped?.slots({ ".Text": true })).toThrow(
      /used after the collector callback returned/,
    );
  });

  it("emits the flat-config entry for the children rule", () => {
    const set = defineContracts(({ contract }) => {
      contract("Card.Heading", CARD_FROM).slots({ ".Text": true });
    });

    expect(set.rules()).toEqual({
      "@jsx-contracts/slots.closure": ["error", set.rows],
    });

    expect(set.rules("warn")["@jsx-contracts/slots.closure"]?.[0]).toBe("warn");
  });
});

describe("mergeContracts", () => {
  it("combines rule sets authored separately", () => {
    const merged = mergeContracts(
      defineContracts(({ contract }) => {
        contract("Card.Heading", CARD_FROM).slots({ ".Text": true });
      }),
      defineContracts(({ contract }) => {
        contract("Card.Body", CARD_FROM).slots({ ".Paragraph": true });
      }),
    );

    expect(merged.rows.map((row) => row.match.name)).toEqual([
      "Card.Heading",
      "Card.Body",
    ]);
  });

  it("keeps every facet of a multi-facet contract", () => {
    const merged = mergeContracts(
      defineContracts(({ contract }) => {
        contract("Card", CARD_FROM)
          .slots({ ".Heading": true })
          .forbidDescendants("button");
      }),
      defineContracts(({ contract }) => {
        contract("Menu", CARD_FROM).slots({ ".Item": true });
      }),
    );

    expect(merged.rows.map((row) => [row.match.name, row.facet])).toEqual([
      ["Card", "slots"],
      ["Card", "subtree"],
      ["Menu", "slots"],
    ]);
  });

  it("throws on a cross-file duplicate component under the same gate", () => {
    expect(() =>
      mergeContracts(
        defineContracts(({ contract }) => {
          contract("Card", CARD_FROM).slots({ ".Text": true });
        }),
        defineContracts(({ contract }) => {
          contract("Card", CARD_FROM).slots({ ".Icon": true });
        }),
      ),
    ).toThrow(
      /duplicate contract for "Card" under gate "~\/components\/Card\.tsx"/,
    );
  });

  it("merges one name under two gates without throwing", () => {
    const merged = mergeContracts(
      defineContracts(({ contract }) => {
        contract("Button", "@acme/ds").slots({ ".Label": true });
      }),
      defineContracts(({ contract }) => {
        contract("Button", "@other/ui").slots({ ".Text": true });
      }),
    );

    expect(merged.rows.map((row) => [row.match.name, row.match.from])).toEqual([
      ["Button", "@acme/ds"],
      ["Button", "@other/ui"],
    ]);
  });
});
