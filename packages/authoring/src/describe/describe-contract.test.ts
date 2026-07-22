// Seam A: authored contracts in through the package's public entry, description
// IR and declarative sentences out. Nothing reaches IR internals through a
// private path or re-implements the prose helper.

import { describe, expect, it } from "vitest";

import type { ContractDescription } from "../index.js";
import { defineContracts, describeContract, toSentences } from "../index.js";

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
});
