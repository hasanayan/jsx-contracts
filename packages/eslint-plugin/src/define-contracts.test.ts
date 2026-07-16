import { describe, expect, it } from "vitest";

import type {
  ContainerConfig,
  NoDescendantsConfig,
} from "./contracts/validate.js";
import {
  defineContract,
  defineContracts,
  mergeContracts,
} from "./define-contracts.js";

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
    },
  });

  it("emits one ContainerConfig per slots facet, with shorthand expanded", () => {
    const expected: ContainerConfig[] = [
      {
        importPath: "*/ds/widget",
        container: "Widget.Tray",
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

    expect(compiled.slots).toEqual(expected);
  });

  it("fans each subtree ban out to one row, re-stamped with gate + name", () => {
    const expected: NoDescendantsConfig[] = [
      {
        importPath: "@acme/widget",
        component: "Widget",
        when: { prop: "compact" },
        forbid: ["Widget.Footer", { name: "button", importPath: "*/ds/*" }],
      },
      {
        importPath: "@acme/widget",
        component: "Widget",
        when: { prop: "size", values: ["large", "Size.huge"] },
        forbidProps: ["autoFocus"],
      },
      {
        importPath: "*/ds/widget",
        component: "Menu",
        when: { prop: "open" },
        forbidProps: ["disabled"],
      },
    ];

    expect(compiled.subtree).toEqual(expected);
  });

  it("omits count keys the author did not set", () => {
    const [tray] = compiled.slots;

    // The compiler only ever emits the object slot form; the string arm of the
    // wire shape is for hand-written payloads.
    const emitted = tray?.slots.filter((slot) => typeof slot !== "string");
    const label = emitted?.find((slot) => slot.name === "Widget.Tray.Label");
    const icon = emitted?.find((slot) => slot.name === "Global.Icon");

    expect(label).not.toHaveProperty("minCount");
    expect(label).not.toHaveProperty("maxCount");
    expect(label).not.toHaveProperty("importPath");
    expect(icon).not.toHaveProperty("minCount");
    expect(icon).not.toHaveProperty("maxCount");
  });

  it("emits presence-activation `when` with no values array", () => {
    const presence = compiled.subtree.find(
      (row) => row.component === "Menu",
    )?.when;

    expect(presence).toEqual({ prop: "open" });
    expect(presence).not.toHaveProperty("values");
  });

  it("produces plain JSON payloads", () => {
    expect(JSON.parse(JSON.stringify(compiled.slots))).toEqual(compiled.slots);
    expect(JSON.parse(JSON.stringify(compiled.subtree))).toEqual(
      compiled.subtree,
    );
  });

  describe("rules() severity forms", () => {
    it("defaults both facets to error", () => {
      expect(compiled.rules()).toEqual({
        "@jsx-contracts/slots": ["error", compiled.slots],
        "@jsx-contracts/subtree": ["error", compiled.subtree],
      });
    });

    it("applies a single severity to both facets", () => {
      const rules = compiled.rules("warn");

      expect(rules["@jsx-contracts/slots"][0]).toBe("warn");
      expect(rules["@jsx-contracts/subtree"][0]).toBe("warn");
    });

    it("applies per-facet severities, defaulting the unset facet to error", () => {
      expect(compiled.rules({ slots: "warn" })).toEqual({
        "@jsx-contracts/slots": ["warn", compiled.slots],
        "@jsx-contracts/subtree": ["error", compiled.subtree],
      });

      expect(compiled.rules({ subtree: "warn" })).toEqual({
        "@jsx-contracts/slots": ["error", compiled.slots],
        "@jsx-contracts/subtree": ["warn", compiled.subtree],
      });
    });
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
});

describe("defineContract", () => {
  it("compiles to the same payload as the equivalent defineContracts entry", () => {
    const single = defineContract(
      "Widget.Tray",
      {
        ".Action": { count: { min: 1, max: 3 } },
        ".Label": true,
      },
      {
        from: "*/ds/widget",
        requires: { ".Label": ".Action" },
        exclusive: [[[".Action"], [".Label"]]],
        strict: true,
        subtree: { compact: { forbid: ["Widget.Footer"] } },
      },
    );

    const plural = defineContracts("*/ds/widget", {
      "Widget.Tray": {
        slots: {
          ".Action": { count: { min: 1, max: 3 } },
          ".Label": true,
        },
        requires: { ".Label": ".Action" },
        exclusive: [[[".Action"], [".Label"]]],
        strict: true,
        subtree: { compact: { forbid: ["Widget.Footer"] } },
      },
    });

    expect(single.slots).toEqual(plural.slots);
    expect(single.subtree).toEqual(plural.subtree);
  });

  it("treats empty slots as a subtree-only component", () => {
    const compiled = defineContract(
      "Widget",
      {},
      { from: "g", subtree: { open: { forbidProps: ["disabled"] } } },
    );

    expect(compiled.slots).toEqual([]);
    expect(compiled.subtree).toEqual([
      {
        importPath: "g",
        component: "Widget",
        when: { prop: "open" },
        forbidProps: ["disabled"],
      },
    ]);
  });

  it("still validates at runtime", () => {
    expect(() =>
      defineContract(
        "Widget.Tray",
        { ".Action": true },
        {
          from: "g",
          requires: { ".Action": ".Bogus" } as never,
        },
      ),
    ).toThrow(/references slot "\.Bogus"/);
  });

  it("exposes a working rules() helper", () => {
    const compiled = defineContract(
      "Widget.Tray",
      { ".Action": true },
      { from: "g" },
    );

    expect(compiled.rules("warn")["@jsx-contracts/slots"][0]).toBe("warn");
  });
});

describe("mergeContracts", () => {
  const widget = defineContract(
    "Widget.Tray",
    { ".Action": true },
    { from: "g", subtree: { open: { forbidProps: ["disabled"] } } },
  );

  const menu = defineContracts("g", {
    "Menu.List": { slots: { ".Item": true } },
    Menu: { subtree: { dense: { forbid: ["Menu.Footer"] } } },
  });

  it("concatenates the slots and subtree of every contract", () => {
    const merged = mergeContracts(widget, menu);

    expect(merged.slots).toEqual([...widget.slots, ...menu.slots]);
    expect(merged.subtree).toEqual([...widget.subtree, ...menu.subtree]);
  });

  it("exposes a rules() over the combined payloads", () => {
    const merged = mergeContracts(widget, menu);

    expect(merged.rules()).toEqual({
      "@jsx-contracts/slots": ["error", merged.slots],
      "@jsx-contracts/subtree": ["error", merged.subtree],
    });

    expect(merged.rules({ subtree: "warn" })["@jsx-contracts/subtree"][0]).toBe(
      "warn",
    );
  });

  it("merges nothing into empty payloads", () => {
    const merged = mergeContracts();

    expect(merged.slots).toEqual([]);
    expect(merged.subtree).toEqual([]);
  });

  it("returns a contract that can itself be merged (nesting)", () => {
    const layout = defineContract("Layout", { ".Slot": true }, { from: "g" });

    const inner = mergeContracts(widget, menu);
    const nested = mergeContracts(inner, layout);
    const flat = mergeContracts(widget, menu, layout);

    // Merging a merged contract equals merging the parts directly.
    expect(nested.slots).toEqual(flat.slots);
    expect(nested.subtree).toEqual(flat.subtree);
    // rules() at the outermost level reflects every contract.
    expect(nested.rules()["@jsx-contracts/slots"][1]).toEqual(flat.slots);
  });
});

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

  // defineContract: a requires ref must be a declared slot key.
  defineContract(
    "Widget.Tray",
    { ".Action": true },
    // @ts-expect-error ".Bogus" is not a declared slot key.
    { from: "g", requires: { ".Action": ".Bogus" } },
  );

  // defineContract: a ban must forbid something.
  defineContract(
    "Widget",
    {},
    // @ts-expect-error ban forbids neither an element nor a prop.
    { from: "g", subtree: { size: { is: ["x"] } } },
  );
}

void typeLevelChecks;
