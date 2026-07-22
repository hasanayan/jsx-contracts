// Seam 2 (core): the effective-vocabulary formula, computed order-independently
// from a set of active branches.

import { describe, expect, it } from "vitest";

import { computeEffectiveVocabulary } from "./effective-vocabulary.js";
import type { SlotsRow } from "./rows.js";

const base: SlotsRow = {
  facet: "slots",
  match: { kind: "name", name: "Card" },
  closed: true,
  slots: [
    { alias: ".Body", match: { kind: "name", name: "Card.Body" } },
    { alias: ".Footer", match: { kind: "name", name: "Card.Footer" } },
  ],
  branches: [
    {
      when: { prop: "onClick" },
      because: "clickable cards have no footer",
      forbidSlots: [".Footer"],
    },
    {
      when: { prop: "variant", values: ["rich"] },
      extend: [
        { alias: ".Media", match: { kind: "name", name: "Card.Media" } },
      ],
    },
    {
      when: { prop: "loading" },
      requireSlots: [".Body"],
    },
    {
      when: { prop: "compact" },
      extend: [
        {
          alias: ".Body",
          match: { kind: "name", name: "Card.Body" },
          count: { max: 1 },
        },
      ],
    },
  ],
};

const names = (
  vocab: ReturnType<typeof computeEffectiveVocabulary>,
): string[] => vocab.slots.map((slot) => slot.match.name).sort();

describe("computeEffectiveVocabulary", () => {
  it("returns the base slots when no branch is active", () => {
    const vocab = computeEffectiveVocabulary(base, () => false);

    expect(names(vocab)).toEqual(["Card.Body", "Card.Footer"]);
    expect(vocab.forbidden.size).toBe(0);
  });

  it("an active extend widens the vocabulary", () => {
    const vocab = computeEffectiveVocabulary(base, (i) => i === 1);

    expect(names(vocab)).toEqual(["Card.Body", "Card.Footer", "Card.Media"]);
  });

  it("an active forbid removes a slot and records why", () => {
    const vocab = computeEffectiveVocabulary(base, (i) => i === 0);

    expect(names(vocab)).toEqual(["Card.Body"]);
    expect(vocab.forbidden.get("Card.Footer")).toEqual([
      {
        match: { kind: "name", name: "Card.Footer" },
        witness: "`Card` has `onClick`",
        because: "clickable cards have no footer",
      },
    ]);
  });

  it("forbid wins over an extend regardless of order", () => {
    const withReAdd: SlotsRow = {
      ...base,
      branches: [
        { when: { prop: "x" }, forbidSlots: [".Footer"] },
        {
          when: { prop: "y" },
          extend: [
            { alias: ".Footer", match: { kind: "name", name: "Card.Footer" } },
          ],
        },
      ],
    };

    expect(names(computeEffectiveVocabulary(withReAdd, () => true))).toEqual([
      "Card.Body",
    ]);
  });

  it("extend replaces a redeclared slot's spec", () => {
    const vocab = computeEffectiveVocabulary(base, (i) => i === 3);
    const body = vocab.slots.find((slot) => slot.alias === ".Body");

    expect(body?.count).toEqual({ max: 1 });
  });

  it("requireSlot raises the minimum to one", () => {
    const vocab = computeEffectiveVocabulary(base, (i) => i === 2);
    const body = vocab.slots.find((slot) => slot.alias === ".Body");

    expect(body?.count?.min).toBe(1);
  });

  it("names a slot only an inactive branch would allow, with its condition", () => {
    const vocab = computeEffectiveVocabulary(base, () => false);

    expect(vocab.conditional.get("Card.Media")).toEqual([
      {
        match: { kind: "name", name: "Card.Media" },
        condition: "`Card`'s `variant` is `rich`",
        because: undefined,
      },
    ]);
  });
});

// Display names collide across gates — one `Button` per design system — so a
// bucket holds every gate declared under the name rather than the last one.
describe("two gates under one display name", () => {
  const twoButtons: SlotsRow = {
    facet: "slots",
    match: { kind: "name", name: "Card", from: "*/ds/card" },
    closed: true,
    slots: [
      { alias: "Ours", match: { kind: "name", name: "Button", from: "*/ds" } },
      {
        alias: "Theirs",
        match: { kind: "name", name: "Button", from: "@other/ui" },
      },
    ],
    branches: [
      { when: { prop: "onClick" }, forbidSlots: ["Ours", "Theirs"] },
      {
        when: { prop: "variant", values: ["rich"] },
        extend: [
          {
            alias: "Ours",
            match: { kind: "name", name: "Button", from: "*/ds" },
          },
          {
            alias: "Theirs",
            match: { kind: "name", name: "Button", from: "@other/ui" },
          },
        ],
      },
    ],
  };

  it("keeps a ban per gate rather than letting the last one win", () => {
    const vocab = computeEffectiveVocabulary(twoButtons, (i) => i === 0);

    expect(vocab.slots).toEqual([]);
    expect(
      vocab.forbidden.get("Button")?.map((entry) => entry.match.from),
    ).toEqual(["*/ds", "@other/ui"]);
  });

  it("an allowed gate does not silence another gate's condition", () => {
    // `Ours` is allowed outright; `Theirs` shares its display name and is only
    // offered by an inactive branch, so it still needs naming.
    const oursAllowed: SlotsRow = {
      facet: "slots",
      match: { kind: "name", name: "Card", from: "*/ds/card" },
      closed: true,
      slots: [
        {
          alias: "Ours",
          match: { kind: "name", name: "Button", from: "*/ds" },
        },
      ],
      branches: [
        {
          when: { prop: "variant", values: ["rich"] },
          extend: [
            {
              alias: "Theirs",
              match: { kind: "name", name: "Button", from: "@other/ui" },
            },
          ],
        },
      ],
    };

    const vocab = computeEffectiveVocabulary(oursAllowed, () => false);

    expect(
      vocab.conditional.get("Button")?.map((entry) => entry.match.from),
    ).toEqual(["@other/ui"]);
  });
});
