import { describe, expect, it } from "vitest";

import { allOf, anyOf, not, prop } from "./conditions.js";
import type { RuleSetV2 } from "./define-contracts.js";
import { defineContracts } from "./define-contracts.js";
import type { Conflict, ConflictKind } from "./find-unsatisfiable.js";
import { findUnsatisfiable } from "./find-unsatisfiable.js";
import { mergeContracts } from "./merge-contracts.js";

const FROM = "~/components/Card.tsx";

describe("v2 unsatisfiability check: conflict classes", () => {
  it("reports a base-required slot a branch forbids", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": (s) => s.min(1), ".Footer": true })
        .when(prop("compact").isPresent(), (c) => c.forbidSlot(".Body"));
    });

    expect(findUnsatisfiable(rules)).toEqual([
      {
        id: "requiredSlotForbidden/Card/Card.Body",
        kind: "requiredSlotForbidden",
        component: "Card",
        facet: "slots",
        slot: "Card.Body",
        branches: [{}, { when: { prop: "compact" } }],
        message:
          "Card (slots): <Card.Body> is required by the base children map and forbidden by the branch when `compact is present`. While both are active the slot is forbidden, so the requirement silently does not apply.",
      },
    ]);
  });

  it("reports a slot one branch requires and another forbids", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .when(prop("loading").isPresent(), (c) => c.requireSlot(".Body"))
        .when(prop("compact").isPresent(), (c) => c.forbidSlot(".Body"));
    });

    expect(findUnsatisfiable(rules)).toEqual([
      {
        id: "requiredSlotForbidden/Card/Card.Body",
        kind: "requiredSlotForbidden",
        component: "Card",
        facet: "slots",
        slot: "Card.Body",
        branches: [
          { when: { prop: "loading" } },
          { when: { prop: "compact" } },
        ],
        message:
          "Card (slots): <Card.Body> is required by the branch when `loading is present` and forbidden by the branch when `compact is present`. While both are active the slot is forbidden, so the requirement silently does not apply.",
      },
    ]);
  });

  it("reports a slot one branch extends and another forbids", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Footer": true })
        .when(prop("rich").isPresent(), (c) =>
          c.extend({ ".Footer": (s) => s.max(2) }),
        )
        .when(prop("plain").isPresent(), (c) => c.forbidSlot(".Footer"));
    });

    expect(findUnsatisfiable(rules)).toEqual([
      {
        id: "extendForbidden/Card/Card.Footer",
        kind: "extendForbidden",
        component: "Card",
        facet: "slots",
        slot: "Card.Footer",
        branches: [{ when: { prop: "rich" } }, { when: { prop: "plain" } }],
        message:
          "Card (slots): <Card.Footer> is extended by the branch when `rich is present` and forbidden by the branch when `plain is present`. While both are active the forbid wins, so the extension silently does not apply.",
      },
    ]);
  });

  it("reports two branches that override one slot differently", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .when(prop("rich").isPresent(), (c) =>
          c.extend({ ".Body": (s) => s.max(1) }),
        )
        .when(prop("dense").isPresent(), (c) =>
          c.extend({ ".Body": (s) => s.max(3) }),
        );
    });

    expect(findUnsatisfiable(rules)).toEqual([
      {
        id: "divergentOverride/Card/Card.Body",
        kind: "divergentOverride",
        component: "Card",
        facet: "slots",
        slot: "Card.Body",
        branches: [{ when: { prop: "rich" } }, { when: { prop: "dense" } }],
        message:
          "Card (slots): <Card.Body> is redeclared differently by the branch when `rich is present` and the branch when `dense is present`. While both are active the two specs disagree, so the effective spec is ambiguous.",
      },
    ]);
  });

  it("stays quiet when two branches override one slot identically", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .when(prop("a").isPresent(), (c) =>
          c.extend({ ".Body": (s) => s.max(1) }),
        )
        .when(prop("b").isPresent(), (c) =>
          c.extend({ ".Body": (s) => s.max(1) }),
        );
    });

    expect(findUnsatisfiable(rules)).toEqual([]);
  });

  it("stays quiet when a branch forbids an optional base slot", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Footer": true })
        .when(prop("compact").isPresent(), (c) => c.forbidSlot(".Footer"));
    });

    expect(findUnsatisfiable(rules)).toEqual([]);
  });
});

describe("v2 unsatisfiability check: syntactic exclusivity", () => {
  it("stays quiet on two branches over disjoint values of one prop", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .when(prop("as").is("a"), (c) => c.extend({ ".Body": (s) => s.max(1) }))
        .when(prop("as").is("button"), (c) =>
          c.extend({ ".Body": (s) => s.max(3) }),
        );
    });

    expect(findUnsatisfiable(rules)).toEqual([]);
  });

  it("stays quiet on a condition against its negation", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .when(prop("expanded").isPresent(), (c) => c.requireSlot(".Body"))
        .when(not(prop("expanded").isPresent()), (c) => c.forbidSlot(".Body"));
    });

    expect(findUnsatisfiable(rules)).toEqual([]);
  });

  it("stays quiet when distribution proves the branches exclusive", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .when(allOf(prop("as").is("a"), prop("dense").isPresent()), (c) =>
          c.forbidSlot(".Body"),
        )
        .when(prop("as").is("button"), (c) => c.requireSlot(".Body"));
    });

    expect(findUnsatisfiable(rules)).toEqual([]);
  });

  it("treats an undecidable pair as co-satisfiable, never inventing a conflict", () => {
    // `anyOf(size, dense)` and `allOf(not size, not dense)` cannot both hold,
    // but deciding that needs reasoning past syntax. The check treats the pair
    // as co-satisfiable — the safe direction — so the narrowing IS reported.
    const rules = defineContracts(({ contract }) => {
      contract("Panel", FROM)
        .slots({ ".Body": true })
        .when(anyOf(prop("size").is("large"), prop("dense").isPresent()), (c) =>
          c.requireSlot(".Body"),
        )
        .when(
          allOf(not(prop("size").is("large")), not(prop("dense").isPresent())),
          (c) => c.forbidSlot(".Body"),
        );
    });

    expect(findUnsatisfiable(rules).map((found) => found.id)).toEqual([
      "requiredSlotForbidden/Panel/Panel.Body",
    ]);
  });
});

describe("v2 unsatisfiability check: the entry point", () => {
  it("reads a whole merged table, component by component", () => {
    const card = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": (s) => s.min(1) })
        .when(prop("compact").isPresent(), (c) => c.forbidSlot(".Body"));
    });

    const menu = defineContracts(({ contract }) => {
      contract("Menu", FROM)
        .slots({ ".Item": (s) => s.min(1) })
        .when(prop("dense").isPresent(), (c) => c.forbidSlot(".Item"));
    });

    expect(
      findUnsatisfiable(mergeContracts(card, menu)).map((found) => found.id),
    ).toEqual([
      "requiredSlotForbidden/Card/Card.Body",
      "requiredSlotForbidden/Menu/Menu.Item",
    ]);
  });

  it("reports one conflict per slot per kind, whichever pair causes it", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": (s) => s.min(1) })
        .when(prop("a").isPresent(), (c) => c.forbidSlot(".Body"))
        .when(prop("b").isPresent(), (c) => c.forbidSlot(".Body"));
    });

    expect(findUnsatisfiable(rules).map((found) => found.branches)).toEqual([
      [{}, { when: { prop: "a" } }],
    ]);
  });

  it("accepts a conflict the author declares deliberate", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": (s) => s.min(1) })
        .when(prop("compact").isPresent(), (c) => c.forbidSlot(".Body"));
    });

    expect(
      findUnsatisfiable(rules, {
        allow: ["requiredSlotForbidden/Card/Card.Body"],
      }),
    ).toEqual([]);
  });

  it("says nothing about a contract with no branches", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM).slots({ ".Body": (s) => s.min(1) });
    });

    expect(findUnsatisfiable(rules)).toEqual([]);
  });

  it("hands back a frozen result", () => {
    const rules = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": (s) => s.min(1) })
        .when(prop("compact").isPresent(), (c) => c.forbidSlot(".Body"));
    });

    expect(Object.isFrozen(findUnsatisfiable(rules))).toBe(true);
  });

  it("never throws — it reports", () => {
    const rules: RuleSetV2 = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": (s) => s.min(1) })
        .when(prop("compact").isPresent(), (c) => c.forbidSlot(".Body"));
    });

    expect(() => findUnsatisfiable(rules)).not.toThrow();
  });
});

// Type-level enforcement. Never executed — tsc checks the @ts-expect-error
// directives when it compiles this file.
function typeLevelChecks(): void {
  const rules = defineContracts(({ contract }) => {
    contract("Card", FROM).slots({ ".Body": true });
  });

  const found = findUnsatisfiable(rules);
  const [conflict] = found;

  if (conflict !== undefined) {
    const kind: ConflictKind = conflict.kind;

    // @ts-expect-error "unknown" is not one of the conflict kinds.
    const bogus: ConflictKind = "unknown";
    // @ts-expect-error the children facet is the only one that conflicts.
    const facet: "props" = conflict.facet;

    void kind;
    void bogus;
    void facet;
  }

  // @ts-expect-error findings are frozen and shared, so the array is readonly.
  const mutable: Conflict[] = found;

  void mutable;
}

void typeLevelChecks;
