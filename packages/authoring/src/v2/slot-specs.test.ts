// Seam 1: each spec verb and key form → correct v2 rows, plus the double-bind
// config error. The verdicts these rows drive are the core's bounds tests.

import { describe, expect, it } from "vitest";

import type { SlotV2 } from "@jsx-contracts/eslint-plugin";

import { defineContracts } from "./define-contracts.js";

const FROM = "~/components/Card.tsx";

function slotsOf(build: Parameters<typeof defineContracts>[0]): SlotV2[] {
  const set = defineContracts(build);
  const [row] = set.rows;

  expect(set.rows).toHaveLength(1);

  return row?.slots ?? [];
}

describe("count verbs", () => {
  it("records min, max and exactly, and leaves a bare slot uncounted", () => {
    const slots = slotsOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        ".Bare": true,
        ".Min": (s) => s.min(2),
        ".Max": (s) => s.max(3),
        ".Exact": (s) => s.exactly(1),
      });
    });

    expect(slots).toEqual([
      { alias: ".Bare", match: { kind: "name", name: "Card.Heading.Bare" } },
      {
        alias: ".Min",
        match: { kind: "name", name: "Card.Heading.Min" },
        count: { min: 2 },
      },
      {
        alias: ".Max",
        match: { kind: "name", name: "Card.Heading.Max" },
        count: { max: 3 },
      },
      {
        alias: ".Exact",
        match: { kind: "name", name: "Card.Heading.Exact" },
        count: { min: 1, max: 1 },
      },
    ]);
  });
});

describe("requires and excludes", () => {
  it("records sibling aliases verbatim, symmetry left to the engine", () => {
    const slots = slotsOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        ".Icon": (s) => s.excludes(".Avatar"),
        ".Avatar": true,
        ".Actions": (s) => s.requires(".Title"),
        ".Title": true,
      });
    });

    const byAlias = new Map(slots.map((slot) => [slot.alias, slot]));

    expect(byAlias.get(".Icon")?.excludes).toEqual([".Avatar"]);
    // The engine computes symmetry; the sibling stays silent at authoring.
    expect(byAlias.get(".Avatar")?.excludes).toBeUndefined();
    expect(byAlias.get(".Actions")?.requires).toEqual([".Title"]);
  });
});

describe("key forms", () => {
  it("implies a dotted key's identity from the subject", () => {
    expect(
      slotsOf(({ contract }) => {
        contract("Card.Heading", FROM).slots({ ".Text": (s) => s.exactly(1) });
      })[0]?.match,
    ).toEqual({ kind: "name", name: "Card.Heading.Text" });
  });

  it("binds a bare capitalized key through is(name, from)", () => {
    const slots = slotsOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        Badge: (s) => s.is("Other.Badge", "@other/pkg"),
      });
    });

    expect(slots[0]).toEqual({
      alias: "Badge",
      match: { kind: "name", name: "Other.Badge" },
      from: "@other/pkg",
    });
  });

  it("resolves a dotted name inside is() against the subject", () => {
    const slots = slotsOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        Icon: (s) => s.is(".Icon"),
      });
    });

    expect(slots[0]?.match).toEqual({
      kind: "name",
      name: "Card.Heading.Icon",
    });
  });

  it("keeps a bare lowercase key as an intrinsic", () => {
    const slots = slotsOf(({ contract }) => {
      contract("List", FROM).slots({ li: (s) => s.max(5) });
    });

    expect(slots[0]).toEqual({
      alias: "li",
      match: { kind: "name", name: "li" },
      count: { max: 5 },
    });
  });

  it("treats true on a capitalized key as is(<key>)", () => {
    expect(
      slotsOf(({ contract }) => {
        contract("Card", FROM).slots({ Badge: true });
      })[0]?.match,
    ).toEqual({ kind: "name", name: "Badge" });
  });
});

describe("config-time errors", () => {
  it("rejects an explicit is() on a dotted key — two binding sources", () => {
    expect(() =>
      defineContracts(({ contract }) => {
        contract("Card.Heading", FROM).slots({
          ".Text": (s) => s.is("Elsewhere.Text"),
        });
      }),
    ).toThrow(/binds its identity twice/);
  });

  it("rejects a bare capitalized key that never binds an identity", () => {
    expect(() =>
      defineContracts(({ contract }) => {
        contract("Card", FROM).slots({ Badge: (s) => s.max(1) });
      }),
    ).toThrow(/must bind an identity with is/);
  });
});
