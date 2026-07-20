import { describe, expect, it } from "vitest";

import type { ContractRow, ContractRows } from "@jsx-contracts/eslint-plugin";

import type { Gate } from "./compile.js";
import type { PartName } from "./component-names.js";
import type { Condition } from "./condition.js";
import type { ContractBuilder, Fragment } from "./contract-builder.js";
import { contractsFor } from "./contracts-for.js";
import { mergeContracts } from "./merge-contracts.js";
import type { CompiledContracts } from "./rule-table.js";

// The tested artifact is the shipped one: every builder and condition is
// reached through `contractsFor`, the public binding, rather than the internal
// `contract`/`condition` modules. The binding fixes one gate, so a thin adapter
// re-admits the per-component gate these tables were written with — each call
// still routes through a real `contractsFor(...).contract(...)`. Without a
// module type the binding widens component names to string, so the tables (and
// the type-level checks below) compile unchanged.
const { prop, allOf, anyOf, not } = contractsFor("g");

function contract(): Fragment;
function contract(component: string, from: Gate): ContractBuilder<never>;
function contract(
  ...named: [] | [string, Gate]
): ContractBuilder<never> | Fragment {
  return named.length === 0
    ? contractsFor("g").contract()
    : contractsFor(named[1]).contract(named[0]);
}

// The compiled payload is one flat table; nearly every assertion below is about
// a single facet's rows, so narrow the table to that facet's arm once here.
const rowsFor = <F extends ContractRow["facet"]>(
  contracts: CompiledContracts,
  facet: F,
): Extract<ContractRow, { facet: F }>[] =>
  contracts.rows.filter(
    (row): row is Extract<ContractRow, { facet: F }> => row.facet === facet,
  );

describe("contract builder", () => {
  it("emits one row per facet the chain touches", () => {
    const fluent = contract("Widget.Tray", "*/ds/widget")
      .hasSlot(".Action")
      .atLeast(1)
      .atMost(3)
      .hasSlot(".Label")
      .slotRequires(".Label", ".Action")
      .exclusiveSlots([".Action"], [".Label"])
      .strictSlots()
      .when(
        prop("variant").is("compact"),
        contract()
          .forbidDescendants("Widget.Footer")
          .forbidDescendantProps("data-analytics"),
      );

    const expected: ContractRows = [
      {
        facet: "slots",
        importPath: "*/ds/widget",
        component: "Widget.Tray",
        slots: [
          { name: "Widget.Tray.Action", minCount: 1, maxCount: 3 },
          { name: "Widget.Tray.Label" },
        ],
        requires: { "Widget.Tray.Label": "Widget.Tray.Action" },
        exclusive: [[["Widget.Tray.Action"], ["Widget.Tray.Label"]]],
        strict: true,
      },
      {
        facet: "subtree",
        importPath: "*/ds/widget",
        component: "Widget.Tray",
        when: { prop: "variant", values: ["compact"] },
        forbid: ["Widget.Footer"],
        forbidProps: ["data-analytics"],
      },
    ];

    expect(fluent.rows).toEqual(expected);
  });

  it("collects every prop-facet method into one props row", () => {
    const fluent = contract("Widget", "@acme/ds")
      .requiresProp("id")
      .requiresAnyProp("href", "onClick")
      .exclusiveProps(["href"], ["onClick"])
      .deprecatesProp("color", "tone")
      .deprecatesProp("legacy")
      .deprecated("Nav");

    expect(rowsFor(fluent, "props")).toEqual([
      {
        facet: "props",
        importPath: "@acme/ds",
        component: "Widget",
        required: ["id", ["href", "onClick"]],
        exclusive: [[["href"], ["onClick"]]],
        deprecated: { color: "tone", legacy: true },
        deprecatedComponent: "Nav",
      },
    ]);
  });

  it("rejects deprecating the same prop twice", () => {
    const built = contract("Widget", "g").deprecatesProp("color");

    expect(() => built.deprecatesProp("color")).toThrow(
      new Error(
        'contract: component "Widget" already deprecates prop "color".',
      ),
    );
  });

  it("rejects deprecating the component twice", () => {
    const built = contract("Widget", "g").deprecated();

    expect(() => built.deprecated()).toThrow(
      new Error('contract: component "Widget" is already deprecated.'),
    );
  });

  it("is immutable: chaining does not change earlier builders", () => {
    const base = contract("Widget.Tray", "g").hasSlot(".A");
    const strictVariant = base.strictSlots();

    expect(rowsFor(base, "slots")[0]?.strict).toBeUndefined();
    expect(rowsFor(strictVariant, "slots")[0]?.strict).toBe(true);
  });

  it("is a CompiledContracts, so mergeContracts combines builders", () => {
    const tray = contract("Widget.Tray", "g").hasSlot(".A");
    const widget = contract("Widget", "g").when(
      prop("open").isPresent(),
      contract().forbidDescendantProps("disabled"),
    );

    const merged = mergeContracts(tray, widget);

    expect(rowsFor(merged, "slots")).toHaveLength(1);
    expect(rowsFor(merged, "subtree")).toHaveLength(1);
  });

  it("rejects a reference to an undeclared slot at call time", () => {
    // The cast defeats the type-state to reach the runtime guard.
    const loose = contract("W", "g").hasSlot(".A") as ContractBuilder<string>;

    expect(() => loose.slotRequires(".A", ".B")).toThrow(
      new Error(
        'contract: component "W" references slot ".B" before declaring it ' +
          "in hasSlot().",
      ),
    );
  });

  it("rejects a dangling exclusive member at call time", () => {
    const loose = contract("W", "g").hasSlot(".A") as ContractBuilder<string>;

    expect(() => loose.exclusiveSlots([".A"], [".B"])).toThrow(
      new Error(
        'contract: component "W" references slot ".B" before declaring it ' +
          "in hasSlot().",
      ),
    );
  });

  it("rejects a cross-slot reference when no slot is declared at all", () => {
    const loose = contract("W", "g") as ContractBuilder<string>;

    expect(() => loose.slotRequires(".A", ".B")).toThrow(
      new Error(
        'contract: component "W" references slot ".A" before declaring it ' +
          "in hasSlot().",
      ),
    );
  });

  it("rejects a second slotRequires for the same slot", () => {
    const built = contract("W", "g")
      .hasSlot(".A")
      .hasSlot(".B")
      .hasSlot(".C")
      .slotRequires(".A", ".B");

    expect(() => built.slotRequires(".A", ".C")).toThrow(
      new Error(
        'contract: component "W" already has a slotRequires() for slot ".A".',
      ),
    );
  });

  it("rejects a count bound with nothing to bound, naming the declarations", () => {
    const loose = contract("W", "g") as ContractBuilder<string> & {
      atLeast: (count: number) => unknown;
    };

    expect(() => loose.atLeast(1)).toThrow(
      new Error(
        'contract: component "W" has no slot or descendant to bound — ' +
          "declare one with hasSlot() or hasDescendant().",
      ),
    );
  });

  describe("hasSlot", () => {
    it("declares a slot in the chain, one call per slot", () => {
      const fluent = contract("Widget.Tray", "g")
        .hasSlot(".Title")
        .hasSlot(".Action");

      expect(rowsFor(fluent, "slots")[0]?.slots).toEqual([
        { name: "Widget.Tray.Title" },
        { name: "Widget.Tray.Action" },
      ]);
    });

    // ADR 0001's count-default table, verbatim: you assert only what you write.
    it("emits the five count-default cases", () => {
      const fluent = contract("Widget.Tray", "g")
        .hasSlot(".Bare")
        .hasSlot(".Lower")
        .atLeast(1)
        .hasSlot(".Upper")
        .atMost(2)
        .hasSlot(".Exact")
        .exactly(1)
        .hasSlot(".Both")
        .atLeast(1)
        .atMost(4);

      expect(rowsFor(fluent, "slots")[0]?.slots).toEqual([
        { name: "Widget.Tray.Bare" },
        { name: "Widget.Tray.Lower", minCount: 1 },
        { name: "Widget.Tray.Upper", maxCount: 2 },
        { name: "Widget.Tray.Exact", minCount: 1, maxCount: 1 },
        { name: "Widget.Tray.Both", minCount: 1, maxCount: 4 },
      ]);
    });

    it("rejects a second bound on one declaration at call time", () => {
      // The type-state spends each bound; the cast is what untyped JS meets.
      const loose = contract("W", "g").hasSlot(".A").atLeast(1) as unknown as {
        atLeast: (count: number) => unknown;
      };

      expect(() => loose.atLeast(2)).toThrow(
        new Error(
          'contract: component "W" bounds slot ".A" twice — atLeast(), ' +
            "atMost() and exactly() each apply once.",
        ),
      );
    });

    it("rejects exactly() after a bound it would overwrite", () => {
      const loose = contract("W", "g").hasSlot(".A").atMost(2) as unknown as {
        exactly: (count: number) => unknown;
      };

      expect(() => loose.exactly(1)).toThrow(
        new Error(
          'contract: component "W" bounds slot ".A" twice — atLeast(), ' +
            "atMost() and exactly() each apply once.",
        ),
      );
    });

    it("carries a part's own import gate to the emitted row", () => {
      const fluent = contract("Widget.Tray", "g").hasSlot(
        "Other.Badge",
        "@other/pkg",
      );

      expect(rowsFor(fluent, "slots")[0]?.slots).toEqual([
        { name: "Other.Badge", importPath: "@other/pkg" },
      ]);
    });

    it("rejects declaring the same slot twice", () => {
      expect(() => contract("W", "g").hasSlot(".A").hasSlot(".A")).toThrow(
        new Error('contract: component "W" declares slot ".A" twice.'),
      );
    });
  });

  describe("hasDescendant", () => {
    it("bounds each descendant on its own, in one when-less row", () => {
      const fluent = contract("Tabs.Root", "@acme/tabs")
        .hasDescendant(".List")
        .atLeast(1)
        .atMost(1)
        .hasDescendant(".Panel");

      expect(rowsFor(fluent, "subtree")).toEqual([
        {
          facet: "subtree",
          importPath: "@acme/tabs",
          component: "Tabs.Root",
          require: [
            { name: "Tabs.Root.List", min: 1, max: 1 },
            { name: "Tabs.Root.Panel" },
          ],
        },
      ]);
    });

    it("expands a leading-dot name to the container's name plus the segment", () => {
      const fluent = contract("Tabs.Root", "@acme/tabs").hasDescendant(".List");

      expect(rowsFor(fluent, "subtree")[0]?.require).toEqual([
        { name: "Tabs.Root.List" },
      ]);
    });

    it("carries a part's own import gate to the emitted row", () => {
      const fluent = contract("Tabs.Root", "@acme/tabs").hasDescendant(
        "Other.List",
        "@other/pkg",
      );

      expect(rowsFor(fluent, "subtree")[0]?.require).toEqual([
        { name: "Other.List", importPath: "@other/pkg" },
      ]);
    });

    it("rejects declaring the same descendant twice", () => {
      expect(() =>
        contract("Tabs.Root", "@acme/tabs")
          .hasDescendant(".List")
          .hasDescendant(".List"),
      ).toThrow(
        new Error(
          'contract: component "Tabs.Root" declares descendant ".List" twice.',
        ),
      );
    });
  });

  describe("notInside", () => {
    it("keeps a self-gated ancestor's gate and a bare name's bareness", () => {
      const fluent = contract("Button", "@acme/ds").notInside("Button", {
        name: "Link",
        from: "@acme/ds",
      });

      expect(rowsFor(fluent, "ancestor")).toEqual([
        {
          facet: "ancestor",
          importPath: "@acme/ds",
          component: "Button",
          notInside: ["Button", { name: "Link", importPath: "@acme/ds" }],
        },
      ]);
    });

    it("appends across repeated .notInside calls", () => {
      const built = contract("Button", "@acme/ds")
        .notInside("Button")
        .notInside("Link");

      expect(rowsFor(built, "ancestor")[0]?.notInside).toEqual([
        "Button",
        "Link",
      ]);
    });

    it("rejects forbidding the same ancestor twice", () => {
      expect(() =>
        contract("Button", "@acme/ds").notInside("Button").notInside("Button"),
      ).toThrow(
        new Error(
          'contract: component "Button" already forbids ancestor "Button".',
        ),
      );
    });

    it("rejects a repeated ancestor within a single call", () => {
      expect(() =>
        contract("Button", "@acme/ds").notInside("Button", "Button"),
      ).toThrow(
        new Error(
          'contract: component "Button" already forbids ancestor "Button".',
        ),
      );
    });

    it("stays available at every chain state and is immutable", () => {
      const base = contract("Button", "@acme/ds").requiresProp("id");
      const withAncestor = base.notInside("Button");

      expect(rowsFor(base, "ancestor")).toEqual([]);
      expect(rowsFor(withAncestor, "ancestor")[0]?.notInside).toEqual([
        "Button",
      ]);
    });
  });
});

// The type-state rejects each call below, so every one of them defeats it with
// a cast: these guards are what an untyped (checkJs) caller still meets. Each
// throws from the call that made the mistake rather than from `.rows` later,
// so the stack lands on the offending line.
//
// Every message is asserted whole, because the message *is* the feature here:
// an author only ever reaches these through the builder, so each one has to
// name the method they wrote and nothing they did not.
describe("arity guards", () => {
  it("rejects a forbidDescendants() naming no elements", () => {
    expect(() =>
      contract("Widget", "g").forbidDescendants(...([] as unknown as [string])),
    ).toThrow(
      new Error(
        'contract: component "Widget" calls forbidDescendants() with no ' +
          "elements.",
      ),
    );
  });

  it("rejects a forbidDescendantProps() naming no props", () => {
    expect(() =>
      contract("Widget", "g").forbidDescendantProps(
        ...([] as unknown as [string]),
      ),
    ).toThrow(
      new Error(
        'contract: component "Widget" calls forbidDescendantProps() with no ' +
          "props.",
      ),
    );
  });

  it("rejects a requiresAnyProp() naming no props", () => {
    expect(() =>
      contract("Widget", "g").requiresAnyProp(
        ...([] as unknown as [string, string]),
      ),
    ).toThrow(
      new Error(
        'contract: component "Widget" calls requiresAnyProp() with no props.',
      ),
    );
  });

  it("rejects an exclusiveProps() group with no props", () => {
    expect(() =>
      contract("Widget", "g").exclusiveProps(["href"], [] as never),
    ).toThrow(
      new Error(
        'contract: component "Widget" calls exclusiveProps() with an empty ' +
          "group.",
      ),
    );
  });

  it("rejects a notInside() naming no ancestors", () => {
    expect(() =>
      contract("Widget", "g").notInside(...([] as unknown as [string])),
    ).toThrow(
      new Error(
        'contract: component "Widget" calls notInside() with no ancestors.',
      ),
    );
  });

  // The rules are authored on the nameless contract, so it is the subject —
  // naming the component the `when` lands on would send the author to a line
  // they did not write.
  it("names the nameless contract an empty call was written in", () => {
    expect(() =>
      contract("Widget", "g").when(
        prop("variant").is("compact"),
        contract().forbidDescendants(...([] as unknown as [string])),
      ),
    ).toThrow(
      new Error(
        "contract: nameless contract calls forbidDescendants() with no " +
          "elements.",
      ),
    );
  });
});

describe("conditions", () => {
  it("compiles a prop-presence condition to a bare prop test", () => {
    const built = contract("Widget", "g").when(
      prop("dense").isPresent(),
      contract().forbidDescendants("Widget.Spacer"),
    );

    expect(rowsFor(built, "subtree")[0]?.when).toEqual({ prop: "dense" });
  });

  it("compiles a prop-value condition to the listed literals", () => {
    const built = contract("Widget", "g").when(
      prop("size").is("large", "Size.huge", 2, true),
      contract().forbidDescendants("Widget.Spacer"),
    );

    expect(rowsFor(built, "subtree")[0]?.when).toEqual({
      prop: "size",
      values: ["large", "Size.huge", 2, true],
    });
  });

  it("nests all, any and not freely", () => {
    const built = contract("Panel", "g").when(
      anyOf(
        allOf(prop("variant").is("compact"), prop("dense").isPresent()),
        not(prop("tight").isPresent()),
      ),
      contract().forbidDescendants("Panel.Footer"),
    );

    expect(rowsFor(built, "subtree")[0]?.when).toEqual({
      any: [
        { all: [{ prop: "variant", values: ["compact"] }, { prop: "dense" }] },
        { not: { prop: "tight" } },
      ],
    });
  });

  it("shares one condition value across the components that use it", () => {
    const compact = prop("variant").is("compact");
    const merged = mergeContracts(
      contract("Card", "g").when(compact, contract().forbidDescendants("X")),
      contract("Panel", "g").when(compact, contract().forbidDescendants("Y")),
    );

    const [card, panel] = rowsFor(merged, "subtree");

    expect(card?.when).toEqual(panel?.when);
  });

  it("rejects an is() with no values", () => {
    expect(() => prop("size").is(...([] as unknown as [string]))).toThrow(
      new Error('prop: is() on "size" needs at least one value.'),
    );
  });

  it("rejects an allOf with fewer than two conditions", () => {
    const one = prop("a").isPresent();

    expect(() => allOf(...([one] as unknown as [never, never]))).toThrow(
      new Error("allOf: needs at least two conditions."),
    );
  });

  it("rejects an anyOf with fewer than two conditions", () => {
    const one = prop("a").isPresent();

    expect(() => anyOf(...([one] as unknown as [never, never]))).toThrow(
      new Error("anyOf: needs at least two conditions."),
    );
  });
});

describe("nameless contracts", () => {
  const compact = prop("variant").is("compact");

  it("emits one row per facet the nameless contract touches", () => {
    const built = contract("Widget.Tray", "@acme/ds")
      .hasSlot(".Title")
      .when(
        compact,
        contract()
          .hasSlot(".Title")
          .forbidDescendants("Widget.Footer")
          .requiresProp("label")
          .notInside("Widget.Modal"),
      );

    const conditional = built.rows.filter((row) => row.when !== undefined);

    expect(conditional.map((row) => row.facet)).toEqual([
      "slots",
      "subtree",
      "props",
      "ancestor",
    ]);

    // Every one of them carries the condition the `when` call named.
    expect(conditional.map((row) => row.when)).toEqual([
      { prop: "variant", values: ["compact"] },
      { prop: "variant", values: ["compact"] },
      { prop: "variant", values: ["compact"] },
      { prop: "variant", values: ["compact"] },
    ]);
  });

  it("expands shorthand names against the component it is attached to", () => {
    // One value, two components: the same `.Title` lands under each of them.
    const titleOnly = contract().hasSlot(".Title");
    const merged = mergeContracts(
      contract("Widget.Tray", "g").when(compact, titleOnly),
      contract("Widget.Bar", "g").when(compact, titleOnly),
    );

    expect(rowsFor(merged, "slots").map((row) => row.slots)).toEqual([
      [{ name: "Widget.Tray.Title" }],
      [{ name: "Widget.Bar.Title" }],
    ]);
  });

  it("carries the component's gate to the conditional rows", () => {
    const built = contract("Widget", "*/ds/widget").when(
      compact,
      contract().forbidDescendants("Widget.Footer"),
    );

    expect(rowsFor(built, "subtree")[0]?.importPath).toBe("*/ds/widget");
  });

  it("keeps the base rows unconditional beside the conditional ones", () => {
    const built = contract("Widget.Tray", "g")
      .hasSlot(".Title")
      .hasSlot(".Action")
      .when(compact, contract().hasSlot(".Title"));

    expect(rowsFor(built, "slots")).toEqual([
      {
        facet: "slots",
        importPath: "g",
        component: "Widget.Tray",
        slots: [{ name: "Widget.Tray.Title" }, { name: "Widget.Tray.Action" }],
      },
      {
        facet: "slots",
        importPath: "g",
        component: "Widget.Tray",
        when: { prop: "variant", values: ["compact"] },
        slots: [{ name: "Widget.Tray.Title" }],
      },
    ]);
  });

  it("conjoins a nested when's condition with the outer one", () => {
    const built = contract("Widget", "g").when(
      compact,
      contract().when(
        prop("dense").isPresent(),
        contract().forbidDescendants("Widget.Spacer"),
      ),
    );

    expect(rowsFor(built, "subtree")[0]?.when).toEqual({
      all: [{ prop: "variant", values: ["compact"] }, { prop: "dense" }],
    });
  });

  it("flattens a conjunction rather than nesting all inside all", () => {
    const built = contract("Widget", "g").when(
      allOf(compact, prop("dense").isPresent()),
      contract().when(
        prop("tight").isPresent(),
        contract().forbidDescendants("Widget.Spacer"),
      ),
    );

    expect(rowsFor(built, "subtree")[0]?.when).toEqual({
      all: [
        { prop: "variant", values: ["compact"] },
        { prop: "dense" },
        { prop: "tight" },
      ],
    });
  });

  it("reuses one nameless contract across two conditions on one component", () => {
    const noImage = contract().forbidDescendants("Card.Image");
    const built = contract("Card", "g")
      .when(compact, noImage)
      .when(prop("inline").isPresent(), noImage);

    expect(rowsFor(built, "subtree")).toEqual([
      {
        facet: "subtree",
        importPath: "g",
        component: "Card",
        when: { prop: "variant", values: ["compact"] },
        forbid: ["Card.Image"],
      },
      {
        facet: "subtree",
        importPath: "g",
        component: "Card",
        when: { prop: "inline" },
        forbid: ["Card.Image"],
      },
    ]);
  });

  it("is immutable: gating one component does not change the value", () => {
    const shared = contract().forbidDescendants("Card.Image");

    contract("Card", "g").when(compact, shared.forbidDescendants("Card.Video"));

    expect(
      rowsFor(contract("Panel", "g").when(compact, shared), "subtree")[0]
        ?.forbid,
    ).toEqual(["Card.Image"]);
  });

  it("rejects reaching for a nameless contract's rule table", () => {
    // The type-state hides `rows`; this is what an untyped caller meets.
    const loose = contract() as unknown as CompiledContracts;

    expect(() => loose.rows).toThrow(
      new Error(
        "contract: a nameless contract has no rule table of its own — " +
          "attach it to a component with when().",
      ),
    );
  });

  // A named builder is structurally alike, so nothing at the type level tells
  // the two apart — the runtime does, by which of them the entry was recorded
  // for.
  it("rejects a when() handed a named contract rather than a nameless one", () => {
    expect(() =>
      contract("W", "g").when(
        compact,
        contract("X", "g") as unknown as Fragment<string>,
      ),
    ).toThrow(
      new Error(
        'contract: component "W" calls when() with something other than a ' +
          "nameless contract from contract().",
      ),
    );
  });

  // Left unguarded this would emit the gated rows unconditionally, so the
  // rules would fire everywhere rather than nowhere.
  it("rejects a when() handed something other than a condition", () => {
    expect(() =>
      contract("W", "g").when(
        undefined as unknown as Condition,
        contract().requiresProp("href"),
      ),
    ).toThrow(
      new Error(
        'contract: component "W" calls when() with something other than a ' +
          "condition from prop()/allOf()/anyOf()/not().",
      ),
    );
  });

  it("names the nameless contract in its own guards", () => {
    expect(() => contract().hasSlot(".A").hasSlot(".A")).toThrow(
      new Error('contract: nameless contract declares slot ".A" twice.'),
    );
  });
});

// A fake design-system module type, so the shorthand checks below have export
// paths to resolve against. `Widget.Tray` has parts under it; `Widget.Footer`
// is a leaf, and `Widget.Tray.Title` sits at the deepest level the module's
// types resolve.
interface WidgetModule {
  Widget: ((props: unknown) => unknown) & {
    Tray: ((props: unknown) => unknown) & {
      Title: (props: unknown) => unknown;
      Action: (props: unknown) => unknown;
    };
    Footer: (props: unknown) => unknown;
  };
}

// The binding a shorthand under `Widget.Tray` is checked against.
interface TrayBinding {
  module: WidgetModule;
  component: "Widget.Tray";
}

// Type-level enforcement. Never executed — tsc checks the @ts-expect-error
// directives when it compiles this file.
function typeLevelChecks(): void {
  const { contract: widget } = contractsFor<WidgetModule>("g");

  // A shorthand naming a part the bound module exports compiles, and still
  // accumulates into the referenceable slot keys.
  widget("Widget.Tray")
    .hasSlot(".Title")
    .hasSlot(".Action")
    .slotRequires(".Action", ".Title")
    .hasDescendant(".Action");

  // @ts-expect-error "Widget.Tray.Bogus" is not an export path of the module.
  widget("Widget.Tray").hasSlot(".Bogus");

  // …and what it prints is the sentence. The rejection arm is an otherwise
  // unsatisfiable `Record` whose *key* carries the message, because the key is
  // what TypeScript renders in the "not assignable to parameter of type" line:
  //
  //   Argument of type '".Bogus"' is not assignable to parameter of type
  //   '".Bogus" & Record<"Widget.Tray.Bogus is not an export path of the bound
  //   module", never>'.
  //
  // Pinned in both directions so the wording cannot drift into an alias name
  // the author cannot read.
  type Rejected = PartName<".Bogus", TrayBinding>;
  type Sentence = Record<
    "Widget.Tray.Bogus is not an export path of the bound module",
    never
  >;

  const printsTheSentence: Sentence = undefined as unknown as Rejected;
  const printsNothingWider: Rejected = undefined as unknown as Sentence;

  void printsTheSentence;
  void printsNothingWider;

  // @ts-expect-error "Widget.Tray.Bogus" is not an export path of the module.
  widget("Widget.Tray").hasDescendant(".Bogus");

  // A multi-segment shorthand is checked whole, against the path it expands to.
  widget("Widget").hasSlot(".Tray.Title");

  // @ts-expect-error "Widget.Tray.Bogus" is not an export path of the module.
  widget("Widget").hasSlot(".Tray.Bogus");

  // A container at the deepest resolvable level degrades to accepting the
  // shorthand unchecked rather than erroring — whether it is a leaf, or as deep
  // as the module's export paths reach.
  widget("Widget.Footer").hasSlot(".Anything");
  widget("Widget.Tray.Title").hasDescendant(".Anything");

  // …and so does a shorthand reaching past that depth from a shallower
  // container: the module's types cannot confirm it either way.
  widget("Widget.Tray").hasSlot(".Title.Anything");

  // A name that is not shorthand is not checked against the module: narrowing
  // full component names is a later additive change.
  widget("Widget.Tray").hasSlot("Other.Badge", "@other/pkg");

  // Without a module type the shorthand widens, so an author with no module
  // type to hand can still use it.
  const { contract: untyped } = contractsFor("g");

  untyped("Widget.Tray").hasSlot(".Anything");

  // `requiresAnyProp` needs at least two props.
  // @ts-expect-error a single prop is not an at-least-one-of group.
  contract("Widget", "g").requiresAnyProp("href");

  // The builder's `notInside` needs at least one ancestor.
  // @ts-expect-error a bare `notInside()` names no ancestor.
  contract("Button", "g").notInside();

  // Builder: slotRequires cannot reference an undeclared slot.
  contract("Widget.Tray", "g")
    .hasSlot(".Title")
    // @ts-expect-error ".Bogus" is not a declared slot key.
    .slotRequires(".Title", ".Bogus");

  // Builder: an exclusivity group cannot name an undeclared slot either.
  contract("Widget.Tray", "g")
    .hasSlot(".Title")
    // @ts-expect-error ".Bogus" is not a declared slot key.
    .exclusiveSlots([".Title"], [".Bogus"]);

  // Builder: nothing can be referenced before hasSlot declares it.
  // @ts-expect-error no slot keys exist yet.
  contract("Widget.Tray", "g").slotRequires(".Title", ".Title");

  // Builder: only slots declared *earlier* in the chain are referenceable — a
  // slot declared further down is not yet a key.
  contract("Widget.Tray", "g")
    .hasSlot(".Title")
    // @ts-expect-error ".Action" is declared after this reference.
    .slotRequires(".Title", ".Action")
    .hasSlot(".Action");

  // Conditions are values, and `when` takes one plus a nameless contract.
  contract("Widget", "g").when(
    allOf(prop("variant").is("compact"), not(prop("dense").isPresent())),
    contract().forbidDescendants("Widget.Footer"),
  );

  // @ts-expect-error the old prop-gated ban spelling is gone.
  contract("Widget", "g").when("variant", ["compact"]);

  // A nameless contract has no rule table of its own.
  // @ts-expect-error `rows` is not on a nameless contract.
  void contract().rows;

  // @ts-expect-error `rules()` is not on a nameless contract either.
  void contract().rules;

  // A nameless contract's cross-slot references resolve against its own slots.
  contract()
    .hasSlot(".Title")
    .hasSlot(".Action")
    .slotRequires(".Action", ".Title");

  // @ts-expect-error ".Bogus" is not a slot the nameless contract declares.
  contract().hasSlot(".Title").slotRequires(".Title", ".Bogus");

  // Count bounds are offered on a nameless contract's declarations too.
  contract().hasSlot(".Title").atLeast(1).atMost(2);

  // @ts-expect-error nothing has been declared to bound.
  void contract().atLeast;

  // allOf/anyOf need two operands.
  // @ts-expect-error one condition is not a composition.
  anyOf(prop("a").isPresent());

  // @ts-expect-error `is()` needs at least one value.
  prop("a").is();

  // Count bounds are offered only directly after a declaration.
  // @ts-expect-error nothing has been declared to bound.
  void contract("Widget.Tray", "g").atLeast;

  // …and vanish once anything else is chained, so a bound cannot silently
  // attach to the wrong part.
  // @ts-expect-error strictSlots() closed the declaration.
  void contract("Widget.Tray", "g").hasSlot(".Title").strictSlots().atLeast;

  // Each bound stays reachable after the other, so `.atLeast(1).atMost(1)`
  // reads as one range.
  contract("Widget.Tray", "g").hasSlot(".Title").atLeast(1).atMost(1);
  contract("Widget.Tray", "g").hasDescendant(".List").atMost(1).atLeast(1);

  // …but each is spent once: a repeat would last-write-win over the first.
  // @ts-expect-error the lower bound is already stated.
  void contract("Widget.Tray", "g").hasSlot(".Title").atLeast(1).atLeast;

  // @ts-expect-error the upper bound is already stated.
  void contract("Widget.Tray", "g").hasDescendant(".List").atMost(1).atMost;

  // `exactly` states both bounds, so nothing is left to state — before or
  // after it.
  contract("Widget.Tray", "g").hasSlot(".Title").exactly(1);

  // @ts-expect-error `exactly` left no bound unspent.
  void contract("Widget.Tray", "g").hasSlot(".Title").exactly(1).atMost;

  // @ts-expect-error `exactly` would overwrite the bound already stated.
  void contract("Widget.Tray", "g").hasSlot(".Title").atLeast(1).exactly;

  // Names declared by hasSlot accumulate into the referenceable slot keys.
  contract("Widget.Tray", "g")
    .hasSlot(".Title")
    .hasSlot(".Action")
    .slotRequires(".Action", ".Title")
    .exclusiveSlots([".Title"], [".Action"]);

  // A descendant is not a slot, so it is not referenceable.
  contract("Widget.Tray", "g")
    .hasDescendant(".List")
    // @ts-expect-error ".List" is a descendant, not a declared slot key.
    .slotRequires(".List", ".List");
}

void typeLevelChecks;
