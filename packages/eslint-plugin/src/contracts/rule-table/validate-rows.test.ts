import { describe, expect, it } from "vitest";

import type { ContractRows } from "./rows.js";
import { validateContractRows } from "./validate-rows.js";

const validRows: ContractRows = [
  {
    facet: "slots",
    match: { kind: "name", name: "Card.Heading" },
    closed: true,
    slots: [
      { alias: ".Text", match: { kind: "name", name: "Card.Heading.Text" } },
    ],
  },
];

describe("validateContractRows", () => {
  it("accepts hand-written rows", () => {
    expect(() => {
      validateContractRows(validRows);
    }).not.toThrow();
  });

  it("accepts a loose row with an empty slots list", () => {
    expect(() => {
      validateContractRows([
        {
          facet: "slots",
          match: { kind: "name", name: "Card" },
          closed: false,
          slots: [],
        },
      ]);
    }).not.toThrow();
  });

  it("rejects a match key of an unknown kind", () => {
    const rows = [
      {
        facet: "slots",
        match: { kind: "identity", name: "Card" },
        closed: true,
        slots: [],
      },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/match key must have kind "name"/);
  });

  it("rejects a match key with no name", () => {
    const rows = [
      {
        facet: "slots",
        match: { kind: "name", name: "" },
        closed: true,
        slots: [],
      },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/match key must name an element/);
  });

  it("rejects a malformed match key on a slot", () => {
    const rows = [
      {
        facet: "slots",
        match: { kind: "name", name: "Card.Heading" },
        closed: true,
        slots: [{ alias: ".Text", match: { kind: "name" } }],
      },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/slot "\.Text" match key must name an element/);
  });

  it("rejects duplicate slot aliases", () => {
    const rows: ContractRows = [
      {
        facet: "slots",
        match: { kind: "name", name: "Card" },
        closed: true,
        slots: [
          { alias: ".Text", match: { kind: "name", name: "Card.Text" } },
          { alias: ".Text", match: { kind: "name", name: "Card.Other" } },
        ],
      },
    ];

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/duplicate slot alias "\.Text"/);
  });

  it("accepts count bounds and sibling references", () => {
    expect(() => {
      validateContractRows([
        {
          facet: "slots",
          match: { kind: "name", name: "Card.Heading" },
          closed: true,
          slots: [
            {
              alias: ".Text",
              match: { kind: "name", name: "Card.Heading.Text" },
              count: { min: 1, max: 1 },
            },
            {
              alias: ".Icon",
              match: { kind: "name", name: "Card.Heading.Icon" },
              excludes: [".Text"],
              requires: [".Text"],
            },
          ],
        },
      ]);
    }).not.toThrow();
  });

  it("rejects a negative count bound", () => {
    const rows = [
      {
        facet: "slots",
        match: { kind: "name", name: "Card" },
        closed: true,
        slots: [
          {
            alias: ".Text",
            match: { kind: "name", name: "Card.Text" },
            count: { min: -1 },
          },
        ],
      },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/min count must be a non-negative number/);
  });

  it("rejects a sibling reference to an undeclared slot", () => {
    const rows = [
      {
        facet: "slots",
        match: { kind: "name", name: "Card" },
        closed: true,
        slots: [
          {
            alias: ".Text",
            match: { kind: "name", name: "Card.Text" },
            excludes: [".Ghost"],
          },
        ],
      },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/excludes names "\.Ghost", which is not a declared slot/);
  });

  it("rejects an unknown facet", () => {
    const rows = [
      { facet: "mystery", match: { kind: "name", name: "Card" } },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/unknown facet/);
  });

  it("accepts a well-formed branch", () => {
    const rows: ContractRows = [
      {
        facet: "slots",
        match: { kind: "name", name: "Card" },
        closed: true,
        slots: [
          { alias: ".Footer", match: { kind: "name", name: "Card.Footer" } },
        ],
        branches: [
          {
            when: { all: [{ prop: "onClick" }, { not: { prop: "flat" } }] },
            because: "clickable cards have no footer",
            forbidSlots: [".Footer"],
          },
        ],
      },
    ];

    expect(() => {
      validateContractRows(rows);
    }).not.toThrow();
  });

  it("rejects a branch condition that names no prop", () => {
    const rows = [
      {
        facet: "slots",
        match: { kind: "name", name: "Card" },
        closed: true,
        slots: [],
        branches: [{ when: {} }],
      },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/condition must name a prop/);
  });

  it("rejects a branch forbidding an undeclared slot", () => {
    const rows = [
      {
        facet: "slots",
        match: { kind: "name", name: "Card" },
        closed: true,
        slots: [],
        branches: [{ when: { prop: "x" }, forbidSlots: [".Ghost"] }],
      },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/forbidSlots names "\.Ghost", not a declared slot/);
  });

  it("accepts subtree and ancestor rows", () => {
    const rows: ContractRows = [
      {
        facet: "subtree",
        match: { kind: "name", name: "Card" },
        descendants: [
          {
            alias: ".Item",
            match: { kind: "name", name: "Card.Item" },
            count: { min: 1 },
          },
        ],
        forbidDescendants: [{ match: { kind: "name", name: "button" } }],
        forbidDescendantProps: ["onClick"],
        branches: [
          {
            when: { prop: "flat" },
            forbidDescendants: [
              { match: { kind: "name", name: "Card.Footer" } },
            ],
          },
        ],
      },
      {
        facet: "ancestor",
        match: { kind: "name", name: "Card.Action" },
        notInside: [{ match: { kind: "name", name: "Table" } }],
        deprecated: { useInstead: "Button" },
      },
    ];

    expect(() => {
      validateContractRows(rows);
    }).not.toThrow();
  });

  it("rejects a forbidDescendants entry with a malformed match key", () => {
    const rows = [
      {
        facet: "subtree",
        match: { kind: "name", name: "Card" },
        descendants: [],
        forbidDescendants: [{ match: { kind: "symbol" } }],
        forbidDescendantProps: [],
      },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/forbidDescendants match key must have kind "name"/);
  });

  it("rejects a duplicate descendant alias", () => {
    const rows = [
      {
        facet: "subtree",
        match: { kind: "name", name: "Card" },
        descendants: [
          { alias: ".Item", match: { kind: "name", name: "Card.Item" } },
          { alias: ".Item", match: { kind: "name", name: "Card.Other" } },
        ],
        forbidDescendants: [],
        forbidDescendantProps: [],
      },
    ] as unknown as ContractRows;

    expect(() => {
      validateContractRows(rows);
    }).toThrow(/duplicate descendant alias "\.Item"/);
  });
});
