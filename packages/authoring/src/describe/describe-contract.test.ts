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

describe("describeContract children facet", () => {
  it("names slots by identity-derived display strings, never aliases", () => {
    const description = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({ ".Text": true, ".Icon": true });
    });

    expect(description).toEqual({
      contracts: [
        {
          subject: "Card.Heading",
          base: {
            children: {
              closed: true,
              slots: [
                { name: "Card.Heading.Text" },
                { name: "Card.Heading.Icon" },
              ],
            },
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

    expect(entry?.base.children?.slots).toEqual([
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

    expect(entry?.base.children?.slots).toEqual([
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

    expect(closed.contracts[0]?.base.children?.closed).toBe(true);
    expect(loose.contracts[0]?.base.children?.closed).toBe(false);
  });

  it("carries strictAnalysis only when it is on", () => {
    const strict = describeOf(({ contract }) => {
      contract("Card", FROM).slots({ ".Body": true }).strictAnalysis();
    });

    const lenient = describeOf(({ contract }) => {
      contract("Card", FROM).slots({ ".Body": true });
    });

    expect(strict.contracts[0]?.base.children?.strictAnalysis).toBe(true);
    expect(lenient.contracts[0]?.base.children).not.toHaveProperty(
      "strictAnalysis",
    );
  });

  it("describes minimal contracts minimally — inapplicable sections absent", () => {
    const description = describeOf(({ contract }) => {
      contract("Card.Heading", FROM).slots({ ".Text": true });
    });

    const [entry] = description.contracts;
    const slot = entry?.base.children?.slots[0];

    // No branches, no props, no requires/excludes: the slot is name-only.
    expect(slot).toEqual({ name: "Card.Heading.Text" });
    expect(slot).not.toHaveProperty("bounds");
    expect(entry?.base).not.toHaveProperty("props");
    expect(entry?.base).not.toHaveProperty("descendants");
    expect(entry?.base).not.toHaveProperty("notInside");
    expect(entry).not.toHaveProperty("branches");
  });
});

describe("describeContract props facet", () => {
  it("describes a props-only contract — no children section, prop rules present", () => {
    const description = describeOf(({ contract }) => {
      contract("Button", FROM).props({
        href: (p) => p.excludes("onClick"),
        variant: (p) => p.deprecated("tone"),
        as: (p) => p.required(),
        icon: (p) => p.requires("label"),
        old: (p) => p.deprecated(),
      });
    });

    expect(description.contracts).toEqual([
      {
        subject: "Button",
        base: {
          props: [
            { name: "href", excludes: ["onClick"] },
            { name: "variant", deprecated: { useInstead: "tone" } },
            { name: "as", required: true },
            { name: "icon", requires: ["label"] },
            { name: "old", deprecated: {} },
          ],
        },
      },
    ]);
  });

  it("carries requiresAnyOf groups as prop-name arrays", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Button", FROM)
        .requiresAnyOf("href", "onClick")
        .requiresAnyOf("aria-label", "title");
    }).contracts;

    expect(entry?.base.requiresAnyOf).toEqual([
      ["href", "onClick"],
      ["aria-label", "title"],
    ]);

    expect(entry?.base).not.toHaveProperty("props");
  });
});

describe("describeContract subtree facet", () => {
  it("describes descendants with bounds, forbidden descendants, and forbidden props", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Tabs", FROM)
        .descendants({ ".Tab": (d) => d.min(1), ".Panel": true })
        .forbidDescendants("button", ".Actions")
        .forbidDescendantProps("onClick", "tabIndex");
    }).contracts;

    expect(entry?.base.descendants).toEqual([
      { name: "Tabs.Tab", bounds: { kind: "atLeast", count: 1 } },
      { name: "Tabs.Panel" },
    ]);

    expect(entry?.base.forbidsDescendants).toEqual(["button", "Tabs.Actions"]);
    expect(entry?.base.forbidsDescendantProps).toEqual(["onClick", "tabIndex"]);
  });
});

describe("describeContract ancestor facet", () => {
  it("describes notInside and component-level deprecation", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Card", FROM).notInside("Table", ".Body").deprecated("Panel");
    }).contracts;

    expect(entry?.base.notInside).toEqual(["Table", "Card.Body"]);
    expect(entry?.base.deprecated).toEqual({ useInstead: "Panel" });
  });

  it("carries an empty deprecation hint when no replacement is named", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Card", FROM).deprecated();
    }).contracts;

    expect(entry?.base.deprecated).toEqual({});
    expect(entry?.base).not.toHaveProperty("notInside");
  });
});

describe("describeContract folds every facet into one contract", () => {
  it("merges children, props, descendants and ancestor rows under one subject", () => {
    const [entry, ...rest] = describeOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .props({ href: (p) => p.required() })
        .descendants({ ".Item": true })
        .notInside("Table");
    }).contracts;

    expect(rest).toEqual([]);
    expect(entry?.subject).toBe("Card");
    expect(entry?.base.children?.slots).toEqual([{ name: "Card.Body" }]);
    expect(entry?.base.props).toEqual([{ name: "href", required: true }]);
    expect(entry?.base.descendants).toEqual([{ name: "Card.Item" }]);
    expect(entry?.base.notInside).toEqual(["Table"]);
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

  it("reunites one authored `when` that touches slots, props and subtree", () => {
    const [entry] = describeOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true, ".Footer": true })
        .when(
          prop("onClick").isPresent(),
          (c) =>
            c
              .forbidSlot(".Footer")
              .props({ href: (p) => p.required() })
              .forbidDescendants("button")
              .forbidDescendantProps("tabIndex"),
          { because: "A clickable card is a link." },
        );
    }).contracts;

    expect(entry?.branches).toEqual([
      {
        when: { prop: "onClick" },
        because: "A clickable card is a link.",
        forbids: ["Card.Footer"],
        props: [{ name: "href", required: true }],
        forbidsDescendants: ["button"],
        forbidsDescendantProps: ["tabIndex"],
      },
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

  it("renders every base facet declaratively", () => {
    const description = describeOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true })
        .strictAnalysis()
        .props({
          href: (p) => p.required(),
          onClick: (p) => p.excludes("href"),
          size: (p) => p.deprecated("scale"),
        })
        .requiresAnyOf("href", "onClick")
        .descendants({ ".Item": (d) => d.min(1) })
        .forbidDescendants("Dialog")
        .forbidDescendantProps("tabIndex")
        .notInside("Table")
        .deprecated("Panel");
    });

    expect(toSentences(description)).toEqual([
      "<Card> is closed: only its declared children may appear.",
      "<Card> uses strict analysis: an opaque region that could break a rule is reported, not assumed fine.",
      "<Card> accepts <Card.Body>.",
      "<Card>'s `href` prop is required.",
      "<Card>'s `onClick` prop excludes `href`.",
      "<Card>'s `size` prop is deprecated — use `scale` instead.",
      "<Card> requires at least one of `href` or `onClick`.",
      "<Card> requires at least one <Card.Item> somewhere below.",
      "<Card> forbids <Dialog> anywhere below.",
      "<Card> forbids `tabIndex` on any descendant.",
      "<Card> may not appear inside <Table>.",
      "<Card> is deprecated — use <Panel> instead.",
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

  it("renders a multi-facet branch delta as one sentence", () => {
    const description = describeOf(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Footer": true })
        .when(prop("onClick").isPresent(), (c) =>
          c
            .forbidSlot(".Footer")
            .props({ href: (p) => p.required() })
            .forbidDescendantProps("tabIndex"),
        );
    });

    expect(toSentences(description)).toEqual([
      "<Card> is closed: only its declared children may appear.",
      "<Card> accepts <Card.Footer>.",
      "When `Card` has `onClick`: forbids <Card.Footer>; its `href` prop is required; forbids `tabIndex` on any descendant.",
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
