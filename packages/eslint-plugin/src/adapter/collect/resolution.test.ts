// Drives the resolver through the `analyze` harness.

import { describe, expect, it } from "vitest";

import { analyze, elementNamed } from "../testing/analyze.js";

import { resolveImportSource } from "./resolution.js";

describe("resolveImportSource", () => {
  function sourceOf(
    code: string,
    tag: string,
    filename?: string,
  ): string | null {
    return analyze(
      code,
      ({ sourceCode, filename: file, elements }) =>
        resolveImportSource(
          sourceCode,
          file,
          elementNamed(elements, tag).openingElement.name,
        ),
      filename,
    );
  }

  it("returns a bare specifier unchanged", () => {
    expect(
      sourceOf(
        'import { Widget } from "@acme/ds";\nconst x = <Widget />;',
        "Widget",
      ),
    ).toBe("@acme/ds");
  });

  it("normalizes a relative specifier against the filename directory", () => {
    expect(
      sourceOf(
        'import { Widget } from "../ds/widget";\nconst x = <Widget />;',
        "Widget",
        "src/features/app.tsx",
      ),
    ).toBe("src/ds/widget");
  });

  it("resolves a member-expression tag through its root identifier", () => {
    expect(
      sourceOf(
        'import { Widget } from "@acme/ds";\nconst x = <Widget.Tray />;',
        "Widget.Tray",
      ),
    ).toBe("@acme/ds");
  });

  it("returns null for a tag that does not resolve to an import", () => {
    expect(
      sourceOf("const Widget = () => null;\nconst x = <Widget />;", "Widget"),
    ).toBeNull();
  });
});
