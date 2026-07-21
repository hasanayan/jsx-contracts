import { describe, expect, it } from "vitest";

import { createImportMatcher, matchesGate } from "./import-gate.js";

describe("createImportMatcher", () => {
  it("matches a literal specifier exactly", () => {
    const matcher = createImportMatcher("~/acme-ds/components/widget");

    expect(matcher("~/acme-ds/components/widget")).toBe(true);
    expect(matcher("x~/acme-ds/components/widget")).toBe(false);
    expect(matcher("~/acme-ds/components/widget/extra")).toBe(false);
  });

  it("treats `*` as any-characters and anchors the pattern", () => {
    const matcher = createImportMatcher("*/acme-ds/components/widget");

    expect(matcher("~/acme-ds/components/widget")).toBe(true);
    expect(matcher("@scope/acme-ds/components/widget")).toBe(true);
    expect(matcher("/acme-ds/components/widget")).toBe(true);
    expect(matcher("~/acme-ds/components/widget/inner")).toBe(false);
    expect(matcher("~/acme-ds/components/badge")).toBe(false);
  });

  it("escapes regexp metacharacters in the literal portion", () => {
    const matcher = createImportMatcher("a.b+c/*");

    expect(matcher("a.b+c/anything")).toBe(true);
    expect(matcher("aXbXc/anything")).toBe(false);
  });
});

describe("matchesGate", () => {
  it("delegates to the matcher for a resolved specifier", () => {
    const matcher = createImportMatcher("*/widget");

    expect(matchesGate(matcher, "~/widget")).toBe(true);
    expect(matchesGate(matcher, "~/badge")).toBe(false);
  });

  it("is lenient when the source did not resolve to an import", () => {
    const matcher = createImportMatcher("~/never-matches-anything");

    expect(matchesGate(matcher, null)).toBe(true);
  });
});
