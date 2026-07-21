// Type-level acceptance (expect-type style): sibling references are keyed to
// the map, and every key form type-checks. The `@ts-expect-error` lines are the
// type assertions — verified by `tsc` (the build); each test also makes a
// runtime assertion so the suite carries its own weight.

import { describe, expect, it } from "vitest";

import { defineContracts } from "./define-contracts.js";

const FROM = "~/components/Card.tsx";

describe("slot spec types", () => {
  it("keys sibling references to the map and accepts every key form", () => {
    const set = defineContracts(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        ".Text": (s) => s.exactly(1),
        ".Icon": (s) => s.excludes(".Avatar").requires(".Text"),
        ".Avatar": true,
        Badge: (s) => s.is("Other.Badge", "@other/pkg"),
        li: true,
      });
    });

    const row = set.rows[0];

    expect(row?.facet === "slots" ? row.slots : []).toHaveLength(5);
  });

  it("rejects a sibling reference that is not a declared key", () => {
    const set = defineContracts(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        ".Text": true,
        // @ts-expect-error ".Nope" is not one of this map's aliases
        ".Icon": (s) => s.excludes(".Nope"),
      });
    });

    expect(set.rows).toHaveLength(1);
  });

  it("rejects a mistyped required sibling too", () => {
    const set = defineContracts(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        // @ts-expect-error ".Missing" is not one of this map's aliases
        ".Actions": (s) => s.requires(".Missing"),
        ".Title": true,
      });
    });

    expect(set.rows).toHaveLength(1);
  });
});
