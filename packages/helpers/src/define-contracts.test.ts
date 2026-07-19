import { describe, expect, it } from "vitest";

import type {
  AncestorRow,
  ContractRow,
  PropsRow,
  SlotsRow,
  SubtreeRow,
} from "@jsx-contracts/eslint-plugin";

import type { CompiledContracts, ContractBuilder } from "./define-contracts.js";
import {
  contract,
  contractsFor,
  defineContracts,
  mergeContracts,
} from "./define-contracts.js";

// The compiled payload is one flat table; nearly every assertion below is about
// a single facet's rows, so narrow the table to that facet's arm once here.
const rowsFor = <F extends ContractRow["facet"]>(
  contracts: CompiledContracts,
  facet: F,
): Extract<ContractRow, { facet: F }>[] =>
  contracts.rows.filter(
    (row): row is Extract<ContractRow, { facet: F }> => row.facet === facet,
  );

describe("defineContracts compilation", () => {
  const compiled = defineContracts("*/ds/widget", {
    "Widget.Tray": {
      slots: {
        ".Action": { count: { min: 1, max: 3 } },
        ".Label": true,
        "Global.Icon": { from: "@acme/icons" },
      },
      requires: { ".Label": ".Action" },
      exclusive: [[[".Action"], [".Label"]]],
      strict: true,
      props: {
        required: ["id", ["href", "onClick"]],
        exclusive: [[["href"], ["onClick"]]],
        deprecated: { color: "tone", legacy: true },
      },
    },
    Widget: {
      // Per-component gate overrides the shared default.
      from: "@acme/widget",
      subtree: {
        compact: {
          forbid: ["Widget.Footer", { name: "button", from: "*/ds/*" }],
        },
        size: { is: ["large", "Size.huge"], forbidProps: ["autoFocus"] },
      },
    },
    Menu: {
      // Inherits the shared gate; subtree-only, presence activation.
      subtree: {
        open: { forbidProps: ["disabled"] },
      },
      // Component-level deprecation with a replacement hint.
      deprecated: "Nav",
    },
  });

  it("emits one slots row per slots facet, with shorthand expanded", () => {
    const expected: SlotsRow[] = [
      {
        facet: "slots",
        importPath: "*/ds/widget",
        component: "Widget.Tray",
        slots: [
          { name: "Widget.Tray.Action", minCount: 1, maxCount: 3 },
          { name: "Widget.Tray.Label" },
          { name: "Global.Icon", importPath: "@acme/icons" },
        ],
        requires: { "Widget.Tray.Label": "Widget.Tray.Action" },
        exclusive: [[["Widget.Tray.Action"], ["Widget.Tray.Label"]]],
        strict: true,
      },
    ];

    expect(rowsFor(compiled, "slots")).toEqual(expected);
  });

  it("fans each subtree ban out to one row, re-stamped with gate + name", () => {
    const expected: SubtreeRow[] = [
      {
        facet: "subtree",
        importPath: "@acme/widget",
        component: "Widget",
        when: { prop: "compact" },
        forbid: ["Widget.Footer", { name: "button", importPath: "*/ds/*" }],
      },
      {
        facet: "subtree",
        importPath: "@acme/widget",
        component: "Widget",
        when: { prop: "size", values: ["large", "Size.huge"] },
        forbidProps: ["autoFocus"],
      },
      {
        facet: "subtree",
        importPath: "*/ds/widget",
        component: "Menu",
        when: { prop: "open" },
        forbidProps: ["disabled"],
      },
    ];

    expect(rowsFor(compiled, "subtree")).toEqual(expected);
  });

  it("emits one props row per component with a prop or component contract", () => {
    const expected: PropsRow[] = [
      {
        facet: "props",
        importPath: "*/ds/widget",
        component: "Widget.Tray",
        required: ["id", ["href", "onClick"]],
        exclusive: [[["href"], ["onClick"]]],
        deprecated: { color: "tone", legacy: true },
      },
      {
        facet: "props",
        importPath: "*/ds/widget",
        component: "Menu",
        deprecatedComponent: "Nav",
      },
    ];

    expect(rowsFor(compiled, "props")).toEqual(expected);
  });

  it("omits count keys the author did not set", () => {
    const [tray] = rowsFor(compiled, "slots");

    // The compiler only ever emits the object slot form; the string arm of the
    // wire shape is for hand-written payloads.
    const emitted = tray?.slots?.filter((slot) => typeof slot !== "string");
    const label = emitted?.find((slot) => slot.name === "Widget.Tray.Label");
    const icon = emitted?.find((slot) => slot.name === "Global.Icon");

    expect(label).not.toHaveProperty("minCount");
    expect(label).not.toHaveProperty("maxCount");
    expect(label).not.toHaveProperty("importPath");
    expect(icon).not.toHaveProperty("minCount");
    expect(icon).not.toHaveProperty("maxCount");
  });

  it("emits presence-activation `when` with no values array", () => {
    const presence = rowsFor(compiled, "subtree").find(
      (row) => row.component === "Menu",
    )?.when;

    expect(presence).toEqual({ prop: "open" });
    expect(presence).not.toHaveProperty("values");
  });

  it("produces a plain JSON payload", () => {
    expect(JSON.parse(JSON.stringify(compiled.rows))).toEqual(compiled.rows);
  });

  describe("rules() severity forms", () => {
    it("names one rule per facet feature", () => {
      expect(Object.keys(compiled.rules())).toEqual([
        "@jsx-contracts/slots.children",
        "@jsx-contracts/slots.count",
        "@jsx-contracts/slots.placement",
        "@jsx-contracts/slots.requires",
        "@jsx-contracts/slots.exclusive",
        "@jsx-contracts/slots.strict",
        "@jsx-contracts/subtree.forbid",
        "@jsx-contracts/subtree.forbidProps",
        "@jsx-contracts/subtree.count",
        "@jsx-contracts/props.required",
        "@jsx-contracts/props.exclusive",
        "@jsx-contracts/props.deprecated",
        "@jsx-contracts/ancestor.forbid",
      ]);
    });

    it("defaults every feature to error over the rule table", () => {
      expect(compiled.rules()).toEqual({
        "@jsx-contracts/slots.children": ["error", compiled.rows],
        "@jsx-contracts/slots.count": ["error", compiled.rows],
        "@jsx-contracts/slots.placement": ["error", compiled.rows],
        "@jsx-contracts/slots.requires": ["error", compiled.rows],
        "@jsx-contracts/slots.exclusive": ["error", compiled.rows],
        "@jsx-contracts/slots.strict": ["error", compiled.rows],
        "@jsx-contracts/subtree.forbid": ["error", compiled.rows],
        "@jsx-contracts/subtree.forbidProps": ["error", compiled.rows],
        "@jsx-contracts/subtree.count": ["error", compiled.rows],
        "@jsx-contracts/props.required": ["error", compiled.rows],
        "@jsx-contracts/props.exclusive": ["error", compiled.rows],
        "@jsx-contracts/props.deprecated": ["error", compiled.rows],
        "@jsx-contracts/ancestor.forbid": ["error", compiled.rows],
      });
    });

    it("hands every rule the same table instance for caching", () => {
      const rules = compiled.rules();

      for (const [, payload] of Object.values(rules)) {
        expect(payload).toBe(compiled.rows);
      }
    });

    it("applies a single severity to both facets", () => {
      const rules = compiled.rules("warn");

      expect(rules["@jsx-contracts/slots.count"][0]).toBe("warn");
      expect(rules["@jsx-contracts/subtree.forbid"][0]).toBe("warn");
    });

    it("applies per-facet severities, defaulting the unset facet to error", () => {
      const slotsWarn = compiled.rules({ slots: "warn" });

      expect(slotsWarn["@jsx-contracts/slots.count"][0]).toBe("warn");
      expect(slotsWarn["@jsx-contracts/subtree.forbid"][0]).toBe("error");
      expect(slotsWarn["@jsx-contracts/props.deprecated"][0]).toBe("error");

      const subtreeWarn = compiled.rules({ subtree: "warn" });

      expect(subtreeWarn["@jsx-contracts/slots.count"][0]).toBe("error");
      expect(subtreeWarn["@jsx-contracts/subtree.forbid"][0]).toBe("warn");

      const propsWarn = compiled.rules({ props: "warn" });

      expect(propsWarn["@jsx-contracts/props.deprecated"][0]).toBe("warn");
      expect(propsWarn["@jsx-contracts/slots.count"][0]).toBe("error");
    });
  });
});

describe("descendants compilation", () => {
  const compiled = defineContracts("@acme/tabs", {
    "Tabs.Root": {
      descendants: {
        ".List": { count: { min: 1, max: 1 } },
        ".Panel": true,
        "Global.Icon": { from: "@acme/icons" },
      },
      // A conditional ban on the same component still emits its own row.
      subtree: { compact: { forbid: ["Tabs.Footer"] } },
    },
  });

  it("compiles descendants to one when-less require row, shorthand expanded", () => {
    const requireRow = rowsFor(compiled, "subtree").find(
      (row) => row.require !== undefined,
    );

    expect(requireRow).toEqual({
      facet: "subtree",
      importPath: "@acme/tabs",
      component: "Tabs.Root",
      require: [
        { name: "Tabs.Root.List", min: 1, max: 1 },
        { name: "Tabs.Root.Panel" },
        { name: "Global.Icon", importPath: "@acme/icons" },
      ],
    });
  });

  it("leaves the require row without a `when`", () => {
    const requireRow = rowsFor(compiled, "subtree").find(
      (row) => row.require !== undefined,
    );

    expect(requireRow).not.toHaveProperty("when");
  });

  it("omits count keys the author did not set", () => {
    const requireRow = rowsFor(compiled, "subtree").find(
      (row) => row.require !== undefined,
    );

    const panel = requireRow?.require?.find(
      (entry) => entry.name === "Tabs.Root.Panel",
    );

    expect(panel).not.toHaveProperty("min");
    expect(panel).not.toHaveProperty("max");
    expect(panel).not.toHaveProperty("importPath");
  });

  it("emits the conditional ban row beside the require row", () => {
    expect(rowsFor(compiled, "subtree")).toHaveLength(2);

    const banRow = rowsFor(compiled, "subtree").find(
      (row) => row.forbid !== undefined,
    );

    expect(banRow).toEqual({
      facet: "subtree",
      importPath: "@acme/tabs",
      component: "Tabs.Root",
      when: { prop: "compact" },
      forbid: ["Tabs.Footer"],
    });
  });

  it("emits nothing for an empty descendants record", () => {
    const empty = defineContracts("@acme/tabs", {
      "Tabs.Root": { descendants: {} },
    });

    expect(rowsFor(empty, "subtree")).toEqual([]);
  });

  it("matches the fluent .hasDescendants builder", () => {
    const fluent = contract("Tabs.Root", "@acme/tabs").hasDescendants({
      ".List": { count: { min: 1, max: 1 } },
      ".Panel": true,
    });

    const object = defineContracts("@acme/tabs", {
      "Tabs.Root": {
        descendants: { ".List": { count: { min: 1, max: 1 } }, ".Panel": true },
      },
    });

    expect(rowsFor(fluent, "subtree")).toEqual(rowsFor(object, "subtree"));
  });

  it("rejects declaring the same descendant twice", () => {
    expect(() =>
      contract("Tabs.Root", "@acme/tabs")
        .hasDescendants({ ".List": true })
        .hasDescendants({ ".List": true }),
    ).toThrow('declares descendant ".List" twice');
  });
});

describe("ancestor compilation", () => {
  const compiled = defineContracts("@acme/ds", {
    Button: {
      notInside: ["Button"],
    },
    "Card.Action": {
      // A gated forbidden ancestor keeps its `from` as importPath; a bare
      // string stays a bare string.
      notInside: [{ name: "Modal.Footer", from: "@acme/modal" }, "Dialog"],
    },
  });

  it("emits one ancestor row per component, restamped with the gate", () => {
    const expected: AncestorRow[] = [
      {
        facet: "ancestor",
        importPath: "@acme/ds",
        component: "Button",
        notInside: ["Button"],
      },
      {
        facet: "ancestor",
        importPath: "@acme/ds",
        component: "Card.Action",
        notInside: [
          { name: "Modal.Footer", importPath: "@acme/modal" },
          "Dialog",
        ],
      },
    ];

    expect(rowsFor(compiled, "ancestor")).toEqual(expected);
  });

  it("produces a plain JSON payload", () => {
    expect(JSON.parse(JSON.stringify(compiled.rows))).toEqual(compiled.rows);
  });

  it("emits nothing when no component forbids an ancestor", () => {
    const none = defineContracts("@acme/ds", {
      Widget: { slots: { ".Action": true } },
    });

    expect(rowsFor(none, "ancestor")).toEqual([]);
  });

  it("matches the fluent .notInside builder", () => {
    const fluent = contract("Button", "@acme/ds").notInside("Button", {
      name: "Link",
      from: "@acme/ds",
    });

    const object = defineContracts("@acme/ds", {
      Button: {
        notInside: ["Button", { name: "Link", from: "@acme/ds" }],
      },
    });

    expect(rowsFor(fluent, "ancestor")).toEqual(rowsFor(object, "ancestor"));
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
    ).toThrow('already forbids ancestor "Button"');
  });

  it("rejects a repeated ancestor within a single call", () => {
    expect(() =>
      contract("Button", "@acme/ds").notInside("Button", "Button"),
    ).toThrow('already forbids ancestor "Button"');
  });

  it("stays available at every chain state and is immutable", () => {
    const base = contract("Button", "@acme/ds").requiresProp("id");
    const withAncestor = base.notInside("Button");

    expect(rowsFor(base, "ancestor")).toEqual([]);
    expect(rowsFor(withAncestor, "ancestor")[0]?.notInside).toEqual(["Button"]);
  });
});

describe("defineContracts runtime validation", () => {
  it("rejects a component with no resolvable import gate", () => {
    expect(() =>
      defineContracts({ Widget: { slots: { ".Action": true } } }),
    ).toThrow(/defineContracts: component "Widget" has no import gate/);
  });

  it("rejects a dangling requires value", () => {
    expect(() =>
      defineContracts("g", {
        Widget: {
          slots: { ".Action": true },
          requires: { ".Action": ".Bogus" } as never,
        },
      }),
    ).toThrow(/references slot "\.Bogus"/);
  });

  it("rejects a dangling requires key", () => {
    expect(() =>
      defineContracts("g", {
        Widget: {
          slots: { ".Action": true },
          requires: { ".Bogus": ".Action" } as never,
        },
      }),
    ).toThrow(/references slot "\.Bogus"/);
  });

  it("rejects a dangling exclusive member", () => {
    expect(() =>
      defineContracts("g", {
        Widget: {
          slots: { ".Action": true },
          exclusive: [[[".Action"], [".Nope"]]] as never,
        },
      }),
    ).toThrow(/references slot "\.Nope"/);
  });

  it("rejects cross-slot references when there is no slots facet", () => {
    expect(() =>
      defineContracts("g", {
        Widget: { requires: { ".Action": ".Label" } } as never,
      }),
    ).toThrow(/references slot "\.Action"/);
  });

  it("rejects an empty `is`", () => {
    expect(() =>
      defineContracts("g", {
        Widget: { subtree: { size: { is: [], forbid: ["button"] } as never } },
      }),
    ).toThrow(/empty `is`/);
  });

  it("rejects an empty `forbid`", () => {
    expect(() =>
      defineContracts("g", {
        Widget: { subtree: { size: { forbid: [] } as never } },
      }),
    ).toThrow(/empty `forbid`/);
  });

  it("rejects an empty `forbidProps`", () => {
    expect(() =>
      defineContracts("g", {
        Widget: { subtree: { size: { forbidProps: [] } as never } },
      }),
    ).toThrow(/empty `forbidProps`/);
  });

  it("rejects a ban that forbids nothing", () => {
    expect(() =>
      defineContracts("g", {
        Widget: { subtree: { size: { is: ["x"] } as never } },
      }),
    ).toThrow(/must forbid an element or a prop/);
  });

  it("rejects an empty required prop group", () => {
    expect(() =>
      defineContracts("g", {
        Widget: { props: { required: [[]] } as never },
      }),
    ).toThrow(/empty required prop group/);
  });

  it("rejects an empty exclusive prop group", () => {
    expect(() =>
      defineContracts("g", {
        Widget: { props: { exclusive: [[["href"], []]] } as never },
      }),
    ).toThrow(/empty exclusive prop group/);
  });
});

describe("mergeContracts", () => {
  const widget = contract("Widget.Tray", "g")
    .hasSlots({ ".Action": true })
    .when("open")
    .forbidProps("disabled");

  const menu = defineContracts("g", {
    "Menu.List": { slots: { ".Item": true } },
    Menu: { subtree: { dense: { forbid: ["Menu.Footer"] } } },
  });

  it("concatenates the rows of every contract", () => {
    const merged = mergeContracts(widget, menu);

    expect(merged.rows).toEqual([...widget.rows, ...menu.rows]);
  });

  it("exposes a rules() over the combined table", () => {
    const merged = mergeContracts(widget, menu);
    const rules = merged.rules();

    expect(rules["@jsx-contracts/slots.count"]).toEqual(["error", merged.rows]);

    expect(rules["@jsx-contracts/subtree.forbid"]).toEqual([
      "error",
      merged.rows,
    ]);

    expect(
      merged.rules({ subtree: "warn" })["@jsx-contracts/subtree.forbid"][0],
    ).toBe("warn");
  });

  it("merges nothing into an empty table", () => {
    const merged = mergeContracts();

    expect(merged.rows).toEqual([]);
  });

  it("concatenates the ancestor rows of every contract", () => {
    const button = contract("Button", "g").notInside("Button");
    const link = contract("Link", "g").notInside("Link");

    const merged = mergeContracts(button, link);

    expect(rowsFor(merged, "ancestor")).toEqual([
      ...rowsFor(button, "ancestor"),
      ...rowsFor(link, "ancestor"),
    ]);

    expect(merged.rules()["@jsx-contracts/ancestor.forbid"][1]).toBe(
      merged.rows,
    );
  });

  it("returns a contract that can itself be merged (nesting)", () => {
    const layout = contract("Layout", "g").hasSlots({ ".Slot": true });

    const inner = mergeContracts(widget, menu);
    const nested = mergeContracts(inner, layout);
    const flat = mergeContracts(widget, menu, layout);

    // Merging a merged contract equals merging the parts directly.
    expect(nested.rows).toEqual(flat.rows);
    // rules() at the outermost level reflects every contract.
    expect(nested.rules()["@jsx-contracts/slots.count"][1]).toEqual(flat.rows);
  });
});

describe("contractsFor", () => {
  it("compiles identically to defineContracts with the bound gate", () => {
    const define = contractsFor("*/ds/widget");

    const bound = define({
      "Widget.Tray": {
        slots: { ".Action": true },
        requires: { ".Action": ".Action" },
      },
      Widget: {
        subtree: { compact: { forbid: ["Widget.Footer"] } },
      },
    });

    const direct = defineContracts("*/ds/widget", {
      "Widget.Tray": {
        slots: { ".Action": true },
        requires: { ".Action": ".Action" },
      },
      Widget: {
        subtree: { compact: { forbid: ["Widget.Footer"] } },
      },
    });

    expect(bound.rows).toEqual(direct.rows);
  });

  it("drops entries explicitly set to undefined", () => {
    const define = contractsFor("*/ds/widget");

    // The type layer rejects explicit `undefined`; untyped (checkJs) callers
    // can still pass it, so the runtime drops it instead of crashing.
    const compiled = define({
      "Widget.Tray": { slots: { ".Action": true } },
      Widget: undefined,
    } as never);

    expect(rowsFor(compiled, "slots")).toHaveLength(1);
    expect(rowsFor(compiled, "subtree")).toHaveLength(0);
  });
});

describe("contract builder", () => {
  it("compiles the same payload as the object DSL", () => {
    const fluent = contract("Widget.Tray", "*/ds/widget")
      .hasSlots({ ".Action": { count: { min: 1, max: 3 } }, ".Label": true })
      .requires(".Label", ".Action")
      .exclusive([".Action"], [".Label"])
      .strict()
      .when("variant", ["compact"])
      .forbid("Widget.Footer")
      .forbidProps("data-analytics");

    const object = defineContracts("*/ds/widget", {
      "Widget.Tray": {
        slots: { ".Action": { count: { min: 1, max: 3 } }, ".Label": true },
        requires: { ".Label": ".Action" },
        exclusive: [[[".Action"], [".Label"]]],
        strict: true,
        subtree: {
          variant: {
            is: ["compact"],
            forbid: ["Widget.Footer"],
            forbidProps: ["data-analytics"],
          },
        },
      },
    });

    expect(fluent.rows).toEqual(object.rows);
  });

  it("compiles the same props payload as the object DSL", () => {
    const fluent = contract("Widget", "@acme/ds")
      .requiresProp("id")
      .requiresOneOf("href", "onClick")
      .exclusiveProps(["href"], ["onClick"])
      .deprecatesProp("color", "tone")
      .deprecatesProp("legacy")
      .deprecated("Nav");

    const object = defineContracts("@acme/ds", {
      Widget: {
        props: {
          required: ["id", ["href", "onClick"]],
          exclusive: [[["href"], ["onClick"]]],
          deprecated: { color: "tone", legacy: true },
        },
        deprecated: "Nav",
      },
    });

    expect(rowsFor(fluent, "props")).toEqual(rowsFor(object, "props"));
  });

  it("rejects deprecating the same prop twice", () => {
    const built = contract("Widget", "g").deprecatesProp("color");

    expect(() => built.deprecatesProp("color")).toThrow(
      "already deprecates prop",
    );
  });

  it("rejects deprecating the component twice", () => {
    const built = contract("Widget", "g").deprecated();

    expect(() => built.deprecated()).toThrow("is already deprecated");
  });

  it("is immutable: chaining does not change earlier builders", () => {
    const base = contract("Widget.Tray", "g").hasSlots({ ".A": true });
    const strictVariant = base.strict();

    expect(rowsFor(base, "slots")[0]?.strict).toBeUndefined();
    expect(rowsFor(strictVariant, "slots")[0]?.strict).toBe(true);
  });

  it("is a CompiledContracts, so mergeContracts combines builders", () => {
    const tray = contract("Widget.Tray", "g").hasSlots({ ".A": true });
    const widget = contract("Widget", "g").when("open").forbidProps("disabled");

    const merged = mergeContracts(tray, widget);

    expect(rowsFor(merged, "slots")).toHaveLength(1);
    expect(rowsFor(merged, "subtree")).toHaveLength(1);
  });

  it("rejects a reference to an undeclared slot at call time", () => {
    // The cast defeats the type-state to reach the runtime guard.
    const loose = contract("W", "g").hasSlots({
      ".A": true,
    }) as ContractBuilder<string>;

    expect(() => loose.requires(".A", ".B")).toThrow('references slot ".B"');
  });

  it("rejects a duplicate slot declaration", () => {
    expect(() =>
      contract("W", "g").hasSlots({ ".A": true }).hasSlots({ ".A": true }),
    ).toThrow('declares slot ".A" twice');
  });

  it("rejects a second requires for the same slot", () => {
    const built = contract("W", "g")
      .hasSlots({ ".A": true, ".B": true, ".C": true })
      .requires(".A", ".B");

    expect(() => built.requires(".A", ".C")).toThrow("already has a requires");
  });

  it("rejects a second ban on the same prop", () => {
    const built = contract("W", "g").when("variant", ["compact"]).forbid("X");

    expect(() => built.when("variant")).toThrow("already has a subtree ban");
  });

  it("is started by contractsFor with the gate bound", () => {
    const define = contractsFor("*/ds/widget");
    const built = define.contract("Widget.Tray").hasSlots({ ".A": true });

    expect(rowsFor(built, "slots")[0]?.importPath).toBe("*/ds/widget");
  });
});

// A fake design-system module type for `contractsFor`'s type-level checks.
interface WidgetModule {
  Widget: ((props: unknown) => unknown) & {
    Tray: ((props: unknown) => unknown) & {
      Title: (props: unknown) => unknown;
    };
    Footer: (props: unknown) => unknown;
  };
  helper: () => void;
}

// Type-level enforcement. Never executed — tsc checks the @ts-expect-error
// directives when it compiles this file.
function typeLevelChecks(): void {
  // A shorthand requires ref must be a declared shorthand slot key.
  defineContracts("g", {
    "Widget.Tray": {
      slots: { ".Action": true },
      // @ts-expect-error ".Bogus" is not a declared slot key.
      requires: { ".Action": ".Bogus" },
    },
  });

  // A bogus requires key is trapped even next to a valid pair.
  defineContracts("g", {
    "Widget.Tray": {
      slots: { ".Title": true, ".Action": true },
      requires: {
        ".Action": ".Title",
        // @ts-expect-error ".Bogus" is not a declared slot key.
        ".Bogus": ".Title",
      },
    },
  });

  // An exclusive group member must be a declared slot key.
  defineContracts("g", {
    "Widget.Tray": {
      slots: { ".Title": true, ".Action": true },
      // @ts-expect-error ".Bogus" is not a declared slot key.
      exclusive: [[[".Title"], [".Bogus"]]],
    },
  });

  // An unknown entry option is rejected, not silently ignored.
  defineContracts("g", {
    "Widget.Tray": {
      slots: { ".Title": true },
      // @ts-expect-error "strick" is not a contract entry option.
      strick: true,
    },
  });

  // `is` must be a non-empty tuple.
  defineContracts("g", {
    Widget: {
      // @ts-expect-error empty `is` tuple.
      subtree: { size: { is: [], forbid: ["button"] } },
    },
  });

  // `forbid` must be a non-empty tuple.
  defineContracts("g", {
    Widget: {
      // @ts-expect-error empty `forbid` tuple.
      subtree: { size: { forbid: [] } },
    },
  });

  // A ban must forbid something.
  defineContracts("g", {
    Widget: {
      // @ts-expect-error ban forbids neither an element nor a prop.
      subtree: { size: { is: ["x"] } },
    },
  });

  // An unknown key inside `props` is trapped, not silently ignored.
  defineContracts("g", {
    Widget: {
      props: {
        required: ["id"],
        // @ts-expect-error "requird" is not a props contract option.
        requird: ["x"],
      },
    },
  });

  // An exclusive prop group must be a non-empty tuple.
  defineContracts("g", {
    Widget: {
      // @ts-expect-error empty exclusive prop group.
      props: { exclusive: [[["href"], []]] },
    },
  });

  // An unknown key inside a descendants spec is trapped, not silently ignored.
  defineContracts("g", {
    "Tabs.Root": {
      // @ts-expect-error "counts" is not a descendant spec option.
      descendants: { ".List": { counts: { min: 1 } } },
    },
  });

  // `requiresOneOf` needs at least two props.
  // @ts-expect-error a single prop is not an at-least-one-of group.
  contract("Widget", "g").requiresOneOf("href");

  // `notInside` must be a non-empty tuple.
  defineContracts("g", {
    Button: {
      // @ts-expect-error empty `notInside` tuple.
      notInside: [],
    },
  });

  // The builder's `notInside` needs at least one ancestor.
  // @ts-expect-error a bare `notInside()` names no ancestor.
  contract("Button", "g").notInside();

  // contractsFor: names come from the module's capitalized export paths.
  const defineWidget = contractsFor<WidgetModule>("g");

  defineWidget({
    "Widget.Tray": { slots: { ".Title": true } },
    "Widget.Tray.Title": {},
    Widget: { strict: true },
  });

  defineWidget({
    // @ts-expect-error "Widget.Trya" is not an export path of the module.
    "Widget.Trya": { slots: { ".Title": true } },
  });

  defineWidget({
    // @ts-expect-error "helper" is lowercase — not a component.
    helper: {},
  });

  // Entry-level validation still applies under a bound module.
  defineWidget({
    "Widget.Tray": {
      slots: { ".Title": true },
      // @ts-expect-error ".Bogus" is not a declared slot key.
      requires: { ".Title": ".Bogus" },
    },
  });

  // Builder: requires cannot reference an undeclared slot.
  contract("Widget.Tray", "g")
    .hasSlots({ ".Title": true })
    // @ts-expect-error ".Bogus" is not a declared slot key.
    .requires(".Title", ".Bogus");

  // Builder: nothing can be referenced before hasSlots declares it.
  // @ts-expect-error no slot keys exist yet.
  contract("Widget.Tray", "g").requires(".Title", ".Title");

  // Builder: a when ban must forbid something before the chain continues.
  // @ts-expect-error strict is not available on a pending ban.
  void contract("Widget", "g").when("open").strict;

  // Bound builder: component names come from the module.
  // @ts-expect-error "Widget.Trya" is not an export path of the module.
  contractsFor<WidgetModule>("g").contract("Widget.Trya");
}

void typeLevelChecks;
