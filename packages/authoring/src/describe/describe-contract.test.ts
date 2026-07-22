// Seam A: authored contracts in through the package's public entry, description
// IR and declarative sentences out. Nothing reaches IR internals through a
// private path or re-implements the prose helper.

import { describe, expect, it } from "vitest";

import type { ContractDescription } from "../index.js";
import {
  allOf,
  anyOf,
  defineContracts,
  describeContract,
  not,
  prop,
  toSentences,
} from "../index.js";

const FROM = "~/components/Card.tsx";

function describeOf(
  build: Parameters<typeof defineContracts>[0],
): ContractDescription {
  return describeContract(defineContracts(build).rows);
}

describe("describeContract base section", () => {
  it("names slots by identity-derived display strings, never aliases", () => {
    const description = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({ ".Text": true, ".Icon": true });
    });

    expect(description).toEqual({
      contracts: [
        {
          subject: "Card.Heading",
          base: {
            closed: true,
            slots: [
              { name: "Card.Heading.Text" },
              { name: "Card.Heading.Icon" },
            ],
          },
        },
      ],
    });
  });

  it("carries bounds as the constraint that was authored", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        ".Bare": true,
        ".One": (s) => s.exactly(1),
        ".Min": (s) => s.min(2),
        ".Max": (s) => s.max(3),
        ".Range": (s) => s.min(1).max(4),
      });
    }).contracts;

    expect(entry?.base?.slots).toEqual([
      { name: "Card.Heading.Bare" },
      { name: "Card.Heading.One", bounds: { kind: "exactly", count: 1 } },
      { name: "Card.Heading.Min", bounds: { kind: "atLeast", count: 2 } },
      { name: "Card.Heading.Max", bounds: { kind: "atMost", count: 3 } },
      {
        name: "Card.Heading.Range",
        bounds: { kind: "between", min: 1, max: 4 },
      },
    ]);
  });

  it("resolves requires and folds excludes symmetry to display names", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        ".Text": (s) => s.requires(".Icon"),
        ".Icon": true,
        ".Avatar": (s) => s.excludes(".Icon"),
      });
    }).contracts;

    expect(entry?.base?.slots).toEqual([
      { name: "Card.Heading.Text", requires: ["Card.Heading.Icon"] },
      { name: "Card.Heading.Icon", excludes: ["Card.Heading.Avatar"] },
      { name: "Card.Heading.Avatar", excludes: ["Card.Heading.Icon"] },
    ]);
  });

  it("reports closure and reflects .loose()", () => {
    const closed = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({ ".Text": true });
    });

    const loose = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({ ".Text": true }).loose();
    });

    expect(closed.contracts[0]?.base?.closed).toBe(true);
    expect(loose.contracts[0]?.base?.closed).toBe(false);
  });

  it("describes minimal contracts minimally — inapplicable sections absent", () => {
    const description = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({ ".Text": true });
    });

    const slot = description.contracts[0]?.base?.slots[0];

    // No branches, no props, no requires/excludes: the slot is name-only.
    expect(slot).toEqual({ name: "Card.Heading.Text" });
    expect(slot).not.toHaveProperty("bounds");
    expect(slot).not.toHaveProperty("requires");
    expect(slot).not.toHaveProperty("excludes");
  });

  it("omits subjects with no children facet", () => {
    const description = describeOf(({ contract }) => {
      contract("Card", FROM).props({ href: (p) => p.excludes("onClick") });
    });

    expect(description.contracts).toEqual([]);
  });
});

describe("describeContract branch deltas", () => {
  it("carries one delta per branch: condition AST, deltas, because at full fidelity", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true, ".Footer": true })
        .when(prop("onClick").isPresent(), (c) => c.forbidSlot(".Footer"), {
          because: "A clickable card has no footer.",
        })
        .when(prop("variant").is("rich"), (c) =>
          c.extend({ ".Media": true }).requireSlot(".Body"),
        );
    }).contracts;

    expect(entry?.branches).toEqual([
      {
        when: { prop: "onClick" },
        because: "A clickable card has no footer.",
        forbids: ["Card.Footer"],
      },
      {
        when: { prop: "variant", values: ["rich"] },
        extend: [{ name: "Card.Media" }],
        requires: ["Card.Body"],
      },
    ]);
  });

  it("resolves forbid/require aliases to display names and describes extend slots", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .when(prop("variant").is("rich"), (c) =>
          c.extend({ ".Media": (s) => s.max(1) }),
        );
    }).contracts;

    expect(entry?.branches?.[0]?.extend).toEqual([
      { name: "Card.Media", bounds: { kind: "atMost", count: 1 } },
    ]);
  });

  it("carries no branches array when the contract has none", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({ ".Text": true });
    }).contracts;

    expect(entry).not.toHaveProperty("branches");
  });
});

describe("toSentences", () => {
  it("renders a base contract as declarative sentences", () => {
    const description = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({
        ".Text": (s) => s.exactly(1),
        ".Icon": true,
      });
    });

    expect(toSentences(description)).toEqual([
      "<Card.Heading> is closed: only its declared children may appear.",
      "<Card.Heading> accepts exactly one <Card.Heading.Text>.",
      "<Card.Heading> accepts <Card.Heading.Icon>.",
    ]);
  });

  it("renders requires and excludes as declarative qualifiers", () => {
    const description = describeOf(({ contract }) => {
      contract("Card.Heading", FROM)
        .slots({
          ".Text": (s) => s.requires(".Icon"),
          ".Icon": true,
          ".Avatar": (s) => s.excludes(".Icon"),
        })
        .loose();
    });

    expect(toSentences(description)).toEqual([
      "<Card.Heading> is loose: children beyond those declared are allowed.",
      "<Card.Heading> accepts <Card.Heading.Text> — requires <Card.Heading.Icon>.",
      "<Card.Heading> accepts <Card.Heading.Icon> — excludes <Card.Heading.Avatar>.",
      "<Card.Heading> accepts <Card.Heading.Avatar> — excludes <Card.Heading.Icon>.",
    ]);
  });

  it("renders branch deltas declaratively with the shared condition prose", () => {
    const description = describeOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true, ".Footer": true })
        .when(prop("onClick").isPresent(), (c) => c.forbidSlot(".Footer"), {
          because: "A clickable card has no footer.",
        })
        .when(prop("variant").is("rich"), (c) =>
          c.extend({ ".Media": (s) => s.max(1) }).requireSlot(".Body"),
        );
    });

    expect(toSentences(description)).toEqual([
      "<Card> is closed: only its declared children may appear.",
      "<Card> accepts <Card.Body>.",
      "<Card> accepts <Card.Footer>.",
      "When `Card` has `onClick`: forbids <Card.Footer> (A clickable card has no footer.).",
      "When `Card`'s `variant` is `rich`: requires <Card.Body>; also accepts at most one <Card.Media>.",
    ]);
  });

  it("phrases nested allOf/anyOf/not conditions through the shared renderer", () => {
    const description = describeOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Footer": true })
        .when(
          allOf(
            anyOf(prop("to").isPresent(), prop("onClick").isPresent()),
            not(prop("variant").is("plain")),
          ),
          (c) => c.forbidSlot(".Footer"),
        );
    });

    expect(toSentences(description)).toEqual([
      "<Card> is closed: only its declared children may appear.",
      "<Card> accepts <Card.Footer>.",
      "When `Card` has `to` or `Card` has `onClick` and `Card`'s `variant` is not `plain`: forbids <Card.Footer>.",
    ]);
  });
});
