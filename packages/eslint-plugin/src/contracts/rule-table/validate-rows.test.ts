// Config-load rejections throw rather than reporting, so they are invisible to
// the rule tester and get their own seam here. Every rejection names the row
// and the problem.
//
// There is deliberately no duplicate guard: many rows may name one component in
// one facet, and combining them is the point. The tests below pin that.

import { describe, expect, it } from "vitest";

import type { ContractRow, ContractRows, WhenCondition } from "./rows.js";
import { validateContractRows } from "./validate-rows.js";

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

  // The condition tree is the one recursive shape in the payload, so its rules
  // have to hold at every depth rather than only at the root.
  describe("when-condition trees", () => {
    const row = (when: WhenCondition): ContractRows => [
      {
        facet: "props",
        importPath: "@acme/ds",
        component: "Button",
        when,
        required: ["href"],
      },
    ];

    it("accepts a tree combining all, any and not", () => {
      expect(() => {
        validateContractRows(
          row({
            all: [
              { any: [{ prop: "variant", values: ["compact"] }, "dense"] },
              { not: "tight" },
            ],
          }),
        );
      }).not.toThrow();
    });

    it("rejects an empty all list", () => {
      expect(() => {
        validateContractRows(row({ all: [] }));
      }).toThrow("when all must not be empty");
    });

    it("rejects an empty any list", () => {
      expect(() => {
        validateContractRows(row({ any: [] }));
      }).toThrow("when any must not be empty");
    });

    it("rejects an empty values list nested under a composite arm", () => {
      expect(() => {
        validateContractRows(
          row({ any: ["dense", { not: { prop: "as", values: [] } }] }),
        );
      }).toThrow('when "as" values must not be empty');
    });

    it("rejects a nameless prop test at any depth", () => {
      expect(() => {
        validateContractRows(row({ all: ["dense", { prop: "" }] }));
      }).toThrow("when must name a prop");
    });

    // The schema's `oneOf` catches this on a configured table; a table built
    // programmatically reaches the validator without passing through it.
    it("rejects an object carrying more than one arm", () => {
      expect(() => {
        validateContractRows(row({ all: ["dense"], not: "tight" }));
      }).toThrow("when must carry one of prop/all/any/not, not all and not");
    });

    it("rejects a prop test carrying a composite arm as well", () => {
      expect(() => {
        validateContractRows(row({ prop: "as", any: ["dense"] }));
      }).toThrow("when must carry one of prop/all/any/not, not prop and any");
    });

    it("names the row the malformed condition sits in", () => {
      expect(() => {
        validateContractRows(row({ not: { all: [] } }));
      }).toThrow(
        "contracts: row 0 (props <Button>) when all must not be empty",
      );
    });
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

    // Allowed slots intersect across rows, so an empty list is not the identity
    // — it would empty the container's slot list and reject every child. An
    // absent list is the identity, and is how a row says nothing about slots.
    it("rejects an empty slots list", () => {
      expect(() => {
        validateContractRows(row({ slots: [] }));
      }).toThrow("slots must not be empty");
    });

    it("accepts a row that declares no slots but turns strictness on", () => {
      expect(() => {
        validateContractRows([
          {
            facet: "slots",
            importPath: "@acme/ds",
            component: "Widget.Tray",
            strict: true,
          },
        ]);
      }).not.toThrow();
    });

    it("rejects a row that says nothing about the children facet at all", () => {
      expect(() => {
        validateContractRows([
          {
            facet: "slots",
            importPath: "@acme/ds",
            component: "Widget.Tray",
          },
        ]);
      }).toThrow("must declare slots, a cross-slot rule, or strictness");
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
