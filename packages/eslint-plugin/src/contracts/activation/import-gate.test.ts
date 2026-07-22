import { describe, expect, it } from "vitest";

import { createImportMatcher } from "./import-gate.js";

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
