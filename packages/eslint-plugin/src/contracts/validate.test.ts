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

  it("rejects a config that forbids nothing", () => {
    expect(() => {
      validateSubtreeOptions([
        { importPath: "*/widget", component: "Widget", when: "to" },
      ]);
    }).toThrow("must forbid at least one element or prop");
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
