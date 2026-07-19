// Config-load rejections throw rather than reporting, so they are invisible to
// the rule tester and get their own seam here. Every rejection names the row
// and the problem.
//
// There is deliberately no duplicate guard: many rows may name one component in
// one facet, and combining them is the point. The tests below pin that.

import { describe, expect, it } from "vitest";

import type { ContractRow, ContractRows } from "./payload.js";
import { validateContractRows } from "./validate.js";

type RowOf<F extends ContractRow["facet"]> = Extract<ContractRow, { facet: F }>;

describe("validateContractRows", () => {
  it("accepts an empty table", () => {
    expect(() => {
      validateContractRows([]);
    }).not.toThrow();
  });

  it("names the row's position and identity in the rejection", () => {
    expect(() => {
      validateContractRows([
        {
          facet: "props",
          importPath: "@acme/ds",
          component: "Button",
          required: ["label"],
        },
        {
          facet: "ancestor",
          importPath: "@acme/ds",
          component: "Link",
          notInside: [],
        },
      ]);
    }).toThrow(
      "contracts: row 1 (ancestor <Link>) notInside must not be empty",
    );
  });

  it("rejects an empty when-values list", () => {
    expect(() => {
      validateContractRows([
        {
          facet: "props",
          importPath: "@acme/ds",
          component: "Button",
          when: { prop: "as", values: [] },
          required: ["href"],
        },
      ]);
    }).toThrow('when "as" values must not be empty');
  });

  // These were the four duplicate guards. Rows accumulate now, so each of them
  // is the normal case rather than an error.
  it("accepts many rows naming one component in one facet", () => {
    const table: ContractRows = [
      {
        facet: "slots",
        importPath: "@acme/ds",
        component: "Widget.Tray",
        slots: ["Widget.Tray.Title"],
      },
      {
        facet: "slots",
        importPath: "@acme/ds",
        component: "Widget.Tray",
        slots: ["Widget.Tray.Title", "Widget.Tray.Action"],
      },
      {
        facet: "subtree",
        importPath: "@acme/ds",
        component: "Widget",
        when: { prop: "variant", values: ["compact"] },
        forbid: ["Widget.Footer"],
      },
      {
        facet: "subtree",
        importPath: "@acme/ds",
        component: "Widget",
        when: { prop: "variant", values: ["dense"] },
        forbid: ["Widget.Header"],
      },
      {
        facet: "props",
        importPath: "@acme/ds",
        component: "Widget",
        required: ["id"],
      },
      {
        facet: "props",
        importPath: "@acme/ds",
        component: "Widget",
        deprecated: { legacy: "modern" },
      },
      {
        facet: "ancestor",
        importPath: "@acme/ds",
        component: "Button",
        notInside: ["Button"],
      },
      {
        facet: "ancestor",
        importPath: "@acme/ds",
        component: "Button",
        notInside: ["Link"],
      },
    ];

    expect(() => {
      validateContractRows(table);
    }).not.toThrow();
  });

  describe("slots rows", () => {
    const row = (extra: Partial<RowOf<"slots">>): ContractRows => [
      {
        facet: "slots",
        importPath: "@acme/ds",
        component: "Widget.Tray",
        slots: ["Widget.Tray.Title"],
        ...extra,
      },
    ];

    it("accepts a well-formed row", () => {
      expect(() => {
        validateContractRows(row({}));
      }).not.toThrow();
    });

    it("rejects a slot declared twice in one row", () => {
      expect(() => {
        validateContractRows(
          row({ slots: ["Widget.Tray.Title", "Widget.Tray.Title"] }),
        );
      }).toThrow('lists duplicate slot "Widget.Tray.Title"');
    });

    it("rejects a fractional minCount", () => {
      expect(() => {
        validateContractRows(
          row({ slots: [{ name: "Widget.Tray.Title", minCount: 1.5 }] }),
        );
      }).toThrow("minCount must be a non-negative integer");
    });

    it("rejects a maxCount of zero", () => {
      expect(() => {
        validateContractRows(
          row({ slots: [{ name: "Widget.Tray.Title", maxCount: 0 }] }),
        );
      }).toThrow("maxCount must be a positive integer");
    });

    it("rejects minCount exceeding maxCount", () => {
      expect(() => {
        validateContractRows(
          row({
            slots: [{ name: "Widget.Tray.Title", minCount: 2, maxCount: 1 }],
          }),
        );
      }).toThrow("minCount exceeds maxCount");
    });

    it("rejects a `requires` reference to a slot the row does not declare", () => {
      expect(() => {
        validateContractRows(
          row({ requires: { "Widget.Tray.Title": "Widget.Tray.Action" } }),
        );
      }).toThrow('references "Widget.Tray.Action", which it does not declare');
    });

    it("rejects an `exclusive` reference to a slot the row does not declare", () => {
      expect(() => {
        validateContractRows(
          row({ exclusive: [[["Widget.Tray.Title"], ["Widget.Tray.Action"]]] }),
        );
      }).toThrow('references "Widget.Tray.Action", which it does not declare');
    });

    // Cross-slot references resolve within a row, never across the table: the
    // merge decides what survives, and it drops a reference whose target
    // another active row intersected away.
    it("rejects a reference to a slot only a sibling row declares", () => {
      expect(() => {
        validateContractRows([
          {
            facet: "slots",
            importPath: "@acme/ds",
            component: "Widget.Tray",
            slots: ["Widget.Tray.Action"],
          },
          {
            facet: "slots",
            importPath: "@acme/ds",
            component: "Widget.Tray",
            slots: ["Widget.Tray.Title"],
            requires: { "Widget.Tray.Title": "Widget.Tray.Action" },
          },
        ]);
      }).toThrow('references "Widget.Tray.Action", which it does not declare');
    });
  });

  describe("subtree rows", () => {
    const row = (extra: Partial<RowOf<"subtree">>): ContractRows => [
      {
        facet: "subtree",
        importPath: "@acme/ds",
        component: "Widget",
        ...extra,
      },
    ];

    it("accepts a row that only requires descendants", () => {
      expect(() => {
        validateContractRows(row({ require: [{ name: "Tabs.List", min: 1 }] }));
      }).not.toThrow();
    });

    it("rejects a row that forbids and requires nothing", () => {
      expect(() => {
        validateContractRows(row({}));
      }).toThrow("must forbid an element or prop, or require a descendant");
    });

    it("rejects an empty forbid list", () => {
      expect(() => {
        validateContractRows(row({ forbid: [] }));
      }).toThrow("forbid must not be empty");
    });

    it("rejects an empty forbidProps list", () => {
      expect(() => {
        validateContractRows(row({ forbidProps: [] }));
      }).toThrow("forbidProps must not be empty");
    });

    it("rejects a nameless require entry", () => {
      expect(() => {
        validateContractRows(row({ require: [{ name: "" }] }));
      }).toThrow("require entry must name an element");
    });

    it("rejects a require entry whose min exceeds its max", () => {
      expect(() => {
        validateContractRows(
          row({ require: [{ name: "Tabs.List", min: 3, max: 2 }] }),
        );
      }).toThrow('require "Tabs.List" min exceeds max');
    });

    it("rejects a require entry with a fractional max", () => {
      expect(() => {
        validateContractRows(
          row({ require: [{ name: "Tabs.List", max: 1.5 }] }),
        );
      }).toThrow('require "Tabs.List" max must be a positive integer');
    });
  });

  describe("props rows", () => {
    const row = (extra: Partial<RowOf<"props">>): ContractRows => [
      { facet: "props", importPath: "@acme/ds", component: "Widget", ...extra },
    ];

    it("rejects a row declaring no prop contract", () => {
      expect(() => {
        validateContractRows(row({}));
      }).toThrow("must declare at least one prop contract");
    });

    it("rejects an empty required group", () => {
      expect(() => {
        validateContractRows(row({ required: [[]] }));
      }).toThrow("has an empty required group");
    });

    it("rejects an empty exclusive group", () => {
      expect(() => {
        validateContractRows(row({ exclusive: [[["a"], []]] }));
      }).toThrow("has an empty exclusive group");
    });
  });

  describe("ancestor rows", () => {
    it("rejects an empty notInside list", () => {
      expect(() => {
        validateContractRows([
          {
            facet: "ancestor",
            importPath: "@acme/ds",
            component: "Button",
            notInside: [],
          },
        ]);
      }).toThrow("notInside must not be empty");
    });

    it("rejects a nameless notInside entry", () => {
      expect(() => {
        validateContractRows([
          {
            facet: "ancestor",
            importPath: "@acme/ds",
            component: "Button",
            notInside: [""],
          },
        ]);
      }).toThrow("notInside entry must name an element");
    });
  });
});
