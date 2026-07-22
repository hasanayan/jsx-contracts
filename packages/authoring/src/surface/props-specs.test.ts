// Seam 1: the props map compiles to props rows.

import { describe, expect, it } from "vitest";

import type { PropsRow } from "@jsx-contracts/core";

import { prop } from "./conditions.js";
import type { PropsMap } from "./define-contracts.js";
import { defineContracts } from "./define-contracts.js";

const FROM = "~/components/Card.tsx";

function propsRow(build: Parameters<typeof defineContracts>[0]): PropsRow {
  const rows = defineContracts(build).rows;
  const row = rows.find((candidate) => candidate.facet === "props");

  if (row === undefined) {
    throw new Error("expected a props row");
  }

  return row;
}

describe("props specs → rows", () => {
  it("records required, requires, excludes and deprecated per prop", () => {
    const row = propsRow(({ contract }) => {
      contract("Button", FROM).props({
        href: (p) => p.excludes("onClick"),
        variant: (p) => p.deprecated("tone"),
        as: (p) => p.required(),
        icon: (p) => p.requires("label"),
        label: (p) => p.required(),
      });
    });

    expect(row.props).toEqual([
      { prop: "href", excludes: ["onClick"] },
      { prop: "variant", deprecated: { useInstead: "tone" } },
      { prop: "as", required: true },
      { prop: "icon", requires: ["label"] },
      { prop: "label", required: true },
    ]);
  });

  it("deprecated with no replacement carries an empty hint", () => {
    const row = propsRow(({ contract }) => {
      contract("Button", FROM).props({ old: (p) => p.deprecated() });
    });

    expect(row.props).toEqual([{ prop: "old", deprecated: {} }]);
  });

  it("compiles requiresAnyOf into contract-level groups", () => {
    const row = propsRow(({ contract }) => {
      contract("Button", FROM)
        .requiresAnyOf("href", "onClick")
        .requiresAnyOf("aria-label", "title");
    });

    expect(row.requiresAnyOf).toEqual([
      ["href", "onClick"],
      ["aria-label", "title"],
    ]);

    expect(row.props).toEqual([]);
  });

  it("throws on a constraint-free entry — the map is always loose", () => {
    expect(() => {
      defineContracts(({ contract }) => {
        contract("Button", FROM).props({ href: (p) => p });
      });
    }).toThrow(/prop "href" states no constraint/);
  });

  it("throws when props is declared twice", () => {
    expect(() => {
      defineContracts(({ contract }) => {
        contract("Button", FROM)
          .props({ a: (p) => p.required() })
          .props({ b: (p) => p.required() });
      });
    }).toThrow(/declares props twice/);
  });

  it("throws when requiresAnyOf names nothing", () => {
    expect(() => {
      defineContracts(({ contract }) => {
        contract("Button", FROM).requiresAnyOf();
      });
    }).toThrow(/requiresAnyOf\(\) needs at least one prop/);
  });

  it("rejects a `true` value at the type level", () => {
    // Unlike a slot, a props entry has no `true` shorthand — every entry is a
    // spec callback. The @ts-expect-error is the assertion.
    const map: PropsMap = {
      onClick: (p) => p.required(),
      // @ts-expect-error a props entry has no `true` shorthand
      href: true,
    };

    expect(Object.keys(map)).toContain("onClick");
  });
});

describe("props as a branch delta", () => {
  it("routes a branch's props to the props row, keeping its condition", () => {
    const rows = defineContracts(({ contract }) => {
      contract("Card", FROM).when(prop("onClick").isPresent(), (c) =>
        c.props({ href: (p) => p.required() }),
      );
    }).rows;

    const row = rows.find((candidate) => candidate.facet === "props");

    expect(row?.branches).toEqual([
      {
        when: { prop: "onClick" },
        props: [{ prop: "href", required: true }],
      },
    ]);
  });

  it("splits a branch that changes both slots and props across two rows", () => {
    const rows = defineContracts(({ contract }) => {
      contract("Card", FROM)
        .slots({ ".Body": true, ".Footer": true })
        .when(
          prop("onClick").isPresent(),
          (c) => c.forbidSlot(".Footer").props({ href: (p) => p.required() }),
          { because: "A clickable card is a link." },
        );
    }).rows;

    const slots = rows.find((candidate) => candidate.facet === "slots");
    const props = rows.find((candidate) => candidate.facet === "props");

    expect(slots?.facet === "slots" ? slots.branches : undefined).toEqual([
      {
        when: { prop: "onClick" },
        because: "A clickable card is a link.",
        forbidSlots: [".Footer"],
      },
    ]);

    expect(props?.facet === "props" ? props.branches : undefined).toEqual([
      {
        when: { prop: "onClick" },
        because: "A clickable card is a link.",
        props: [{ prop: "href", required: true }],
      },
    ]);
  });
});
