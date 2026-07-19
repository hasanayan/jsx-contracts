import { describe, expect, it } from "vitest";

import type {
  AncestorRow,
  ContractRow,
  PropsRow,
  SlotsRow,
  SubtreeRow,
} from "@jsx-contracts/eslint-plugin";

import { defineContracts } from "./define-contracts.js";
import type { CompiledContracts } from "./rule-table.js";

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
