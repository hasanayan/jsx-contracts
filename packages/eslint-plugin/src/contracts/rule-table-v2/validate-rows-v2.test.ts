import { describe, expect, it } from "vitest";

import type { ContractRowsV2 } from "./rows-v2.js";
import { validateContractRowsV2 } from "./validate-rows-v2.js";

const validRows: ContractRowsV2 = [
  {
    facet: "slots",
    match: { kind: "name", name: "Card.Heading" },
    closed: true,
    slots: [
      { alias: ".Text", match: { kind: "name", name: "Card.Heading.Text" } },
    ],
  },
];

describe("validateContractRowsV2", () => {
  it("accepts hand-written v2 rows", () => {
    expect(() => {
      validateContractRowsV2(validRows);
    }).not.toThrow();
  });

  it("accepts a loose row with an empty slots list", () => {
    expect(() => {
      validateContractRowsV2([
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
    ] as unknown as ContractRowsV2;

    expect(() => {
      validateContractRowsV2(rows);
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
    ] as unknown as ContractRowsV2;

    expect(() => {
      validateContractRowsV2(rows);
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
    ] as unknown as ContractRowsV2;

    expect(() => {
      validateContractRowsV2(rows);
    }).toThrow(/slot "\.Text" match key must name an element/);
  });

  it("rejects duplicate slot aliases", () => {
    const rows: ContractRowsV2 = [
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
      validateContractRowsV2(rows);
    }).toThrow(/duplicate slot alias "\.Text"/);
  });

  it("accepts count bounds and sibling references", () => {
    expect(() => {
      validateContractRowsV2([
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
    ] as unknown as ContractRowsV2;

    expect(() => {
      validateContractRowsV2(rows);
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
    ] as unknown as ContractRowsV2;

    expect(() => {
      validateContractRowsV2(rows);
    }).toThrow(/excludes names "\.Ghost", which is not a declared slot/);
  });

  it("rejects an unknown facet", () => {
    const rows = [
      { facet: "props", match: { kind: "name", name: "Card" } },
    ] as unknown as ContractRowsV2;

    expect(() => {
      validateContractRowsV2(rows);
    }).toThrow(/unknown facet/);
  });
});
