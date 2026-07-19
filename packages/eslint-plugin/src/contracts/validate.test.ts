import { describe, expect, it } from "vitest";

import { validateSlotsOptions, validateSubtreeOptions } from "./validate.js";

describe("validateSlotsOptions", () => {
  it("accepts a well-formed config", () => {
    expect(() => {
      validateSlotsOptions([
        {
          importPath: "*/widget",
          container: "Widget.Tray",
          slots: ["Widget.Tray.Link", { name: "Chip", maxCount: 2 }],
          requires: { Chip: "Widget.Tray.Link" },
          exclusive: [[["Chip"], ["Widget.Tray.Link"]]],
        },
      ]);
    }).not.toThrow();
  });

  it("rejects a fractional minCount", () => {
    expect(() => {
      validateSlotsOptions([
        {
          importPath: "*/widget",
          container: "Widget.Tray",
          slots: [{ name: "Chip", minCount: 1.5 }],
        },
      ]);
    }).toThrow("minCount must be a non-negative integer");
  });

  it("prefixes config errors with the slots rule name", () => {
    expect(() => {
      validateSlotsOptions([
        { importPath: "*/widget", container: "Widget.Tray", slots: [] },
        { importPath: "*/widget", container: "Widget.Tray", slots: [] },
      ]);
    }).toThrow(/^slots: duplicate container/);
  });
});

describe("validateSubtreeOptions", () => {
  it("accepts a well-formed config", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/widget",
          component: "Widget",
          when: { prop: "variant", values: ["primary"] },
          forbid: ["button"],
          forbidProps: ["onClick"],
        },
      ]);
    }).not.toThrow();
  });

  it("rejects a config that forbids and requires nothing", () => {
    expect(() => {
      validateSubtreeOptions([
        { importPath: "*/widget", component: "Widget", when: "to" },
      ]);
    }).toThrow("must forbid an element or prop, or require a descendant");
  });

  it("accepts a when-less row that only requires descendants", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/tabs",
          component: "Tabs.Root",
          require: [{ name: "Tabs.List", min: 1, max: 1 }],
        },
      ]);
    }).not.toThrow();
  });

  it("rejects a require entry whose min exceeds its max", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/tabs",
          component: "Tabs.Root",
          require: [{ name: "Tabs.List", min: 3, max: 1 }],
        },
      ]);
    }).toThrow('require "Tabs.List" min exceeds max');
  });

  it("rejects a require entry with a fractional max", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/tabs",
          component: "Tabs.Root",
          require: [{ name: "Tabs.List", max: 1.5 }],
        },
      ]);
    }).toThrow('require "Tabs.List" max must be a positive integer');
  });

  it("does not treat two when-less rows on one component as duplicates", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/tabs",
          component: "Tabs.Root",
          require: [{ name: "Tabs.List" }],
        },
        {
          importPath: "*/tabs",
          component: "Tabs.Root",
          forbid: ["button"],
        },
      ]);
    }).not.toThrow();
  });

  it("prefixes config errors with the subtree rule name", () => {
    expect(() => {
      validateSubtreeOptions([
        {
          importPath: "*/widget",
          component: "Widget",
          when: { prop: "variant", values: [] },
          forbid: ["button"],
        },
      ]);
    }).toThrow(/^subtree: /);
  });
});
