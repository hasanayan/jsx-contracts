import { describe, expect, it } from "vitest";

import { normalizeWhen } from "./normalize-when.js";
import type { When } from "./rows.js";

const key = (when: When): string => JSON.stringify(normalizeWhen(when));

describe("normalizeWhen", () => {
  it("orders keys so a prop/values object hashes alike either way round", () => {
    expect(key({ prop: "variant", values: ["compact", 2, false] })).toBe(
      key({ values: ["compact", 2, false], prop: "variant" }),
    );
  });

  it("drops the values key for a bare presence test", () => {
    expect(normalizeWhen({ prop: "open" })).toEqual({ prop: "open" });
  });

  it("copies the values array rather than sharing it", () => {
    const values = ["a", "b"];
    const normalized = normalizeWhen({ prop: "variant", values });

    expect(normalized).toEqual({ prop: "variant", values: ["a", "b"] });
    expect("values" in normalized && normalized.values).not.toBe(values);
  });

  it("normalizes nested all/any/not trees recursively", () => {
    expect(
      normalizeWhen({
        all: [{ prop: "a", values: ["x"] }, { not: { prop: "b" } }],
      }),
    ).toEqual({ all: [{ prop: "a", values: ["x"] }, { not: { prop: "b" } }] });
  });

  it("keeps value order and all-versus-any distinct", () => {
    expect(key({ prop: "v", values: ["a", "b"] })).not.toBe(
      key({ prop: "v", values: ["b", "a"] }),
    );

    expect(key({ all: [{ prop: "a" }, { prop: "b" }] })).not.toBe(
      key({ any: [{ prop: "a" }, { prop: "b" }] }),
    );
  });
});
