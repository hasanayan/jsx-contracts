// Seam 1: `when(condition, delta, { because })` → branch rows at full fidelity.

import { describe, expect, it } from "vitest";

import type { SlotBranch } from "@jsx-contracts/eslint-plugin";

import { allOf, prop } from "./conditions.js";
import { defineContracts } from "./define-contracts.js";

const FROM = "~/components/Card.tsx";

function branchesOf(
  build: Parameters<typeof defineContracts>[0],
): SlotBranch[] {
  const [row] = defineContracts(build).rows;

  return row?.facet === "slots" ? (row.branches ?? []) : [];
}

describe("when → branch rows", () => {
  it("carries the condition tree and because verbatim", () => {
    const branches = branchesOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true, ".Footer": true })
        .when(prop("onClick").isPresent(), (c) => c.forbidSlot(".Footer"), {
          because: "A clickable card has no footer.",
        });
    });

    expect(branches).toEqual([
      {
        when: { prop: "onClick" },
        because: "A clickable card has no footer.",
        forbidSlots: [".Footer"],
      },
    ]);
  });

  it("records requireSlot and a composite condition", () => {
    const [branch] = branchesOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .when(
          allOf(prop("loading").isPresent(), prop("variant").is("rich")),
          (c) => c.requireSlot(".Body"),
        );
    });

    expect(branch?.when).toEqual({
      all: [{ prop: "loading" }, { prop: "variant", values: ["rich"] }],
    });

    expect(branch?.requireSlots).toEqual([".Body"]);
    expect(branch?.because).toBeUndefined();
  });

  it("expands an extend map's dotted shorthand against the subject", () => {
    const [branch] = branchesOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .when(prop("variant").is("rich"), (c) =>
          c.extend({ ".Media": true, ".Body": (s) => s.max(1) }),
        );
    });

    expect(branch?.extend).toEqual([
      {
        alias: ".Media",
        match: { kind: "name", name: "Card.Media", from: FROM },
      },
      {
        alias: ".Body",
        match: { kind: "name", name: "Card.Body", from: FROM },
        count: { max: 1 },
      },
    ]);
  });

  it("keeps branches as independent facts in declaration order", () => {
    const branches = branchesOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true, ".Footer": true })
        .when(prop("a").isPresent(), (c) => c.forbidSlot(".Footer"))
        .when(prop("b").isPresent(), (c) => c.requireSlot(".Body"));
    });

    expect(branches).toHaveLength(2);
    expect(branches[0]?.forbidSlots).toEqual([".Footer"]);
    expect(branches[1]?.requireSlots).toEqual([".Body"]);
  });

  it("emits a row for a contract whose only children fact is a branch", () => {
    const [row] = defineContracts(({ contract }) => {
      contract("Card", FROM).when(prop("x").isPresent(), (c) =>
        c.extend({ ".Extra": true }),
      );
    }).rows;

    expect(row?.facet === "slots" ? row.slots : undefined).toEqual([]);
    expect(row?.facet === "slots" ? row.branches : undefined).toHaveLength(1);
  });
});
