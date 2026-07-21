// Drives the ancestor collector through the `analyze` harness (a live
// SourceCode).

import { describe, expect, it } from "vitest";

import { analyze, elementNamed } from "../testing/analyze.js";

import { collectAncestors } from "./ancestors.js";

describe("collectAncestors", () => {
  function ancestorsOf(
    code: string,
    tag: string,
  ): { name: string; importSource: string | null }[] {
    return analyze(code, ({ sourceCode, filename, elements }) =>
      collectAncestors(sourceCode, filename, elementNamed(elements, tag)),
    );
  }

  it("walks the enclosing elements innermost-first", () => {
    expect(
      ancestorsOf("const x = <A><B><C /></B></A>;", "C").map(
        (ancestor) => ancestor.name,
      ),
    ).toEqual(["B", "A"]);
  });

  it("counts a JSX-valued prop as containment", () => {
    expect(
      ancestorsOf("const x = <A header={<B><C /></B>} />;", "C").map(
        (ancestor) => ancestor.name,
      ),
    ).toEqual(["B", "A"]);
  });

  it("carries each ancestor's import source", () => {
    const [nearest] = ancestorsOf(
      'import { A } from "@acme/ds";\nconst x = <A><C /></A>;',
      "C",
    );

    expect(nearest).toEqual({ name: "A", importSource: "@acme/ds" });
  });

  it("drops a namespaced ancestor rather than naming it", () => {
    expect(
      ancestorsOf("const x = <A><svg:g><C /></svg:g></A>;", "C").map(
        (ancestor) => ancestor.name,
      ),
    ).toEqual(["A"]);
  });

  it("does not follow hoisting: a hoisted element has no ancestors", () => {
    expect(ancestorsOf("const c = <C />;\nconst x = <A>{c}</A>;", "C")).toEqual(
      [],
    );
  });

  it("returns an empty chain for a top-level element", () => {
    expect(ancestorsOf("const x = <C />;", "C")).toEqual([]);
  });
});
