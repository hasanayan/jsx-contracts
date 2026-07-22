import { describe, expect, it } from "vitest";

import { matchesWhileAbsent } from "./prop-absence.js";

describe("matchesWhileAbsent", () => {
  it("counts a false literal and the undefined identifier absent", () => {
    expect(matchesWhileAbsent(false)).toBe(true);
    expect(matchesWhileAbsent("undefined")).toBe(true);
  });

  it("counts every other literal present", () => {
    expect(matchesWhileAbsent(true)).toBe(false);
    expect(matchesWhileAbsent(0)).toBe(false);
    expect(matchesWhileAbsent(42)).toBe(false);
    expect(matchesWhileAbsent("compact")).toBe(false);
  });
});
