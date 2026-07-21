// Drives the slots-facet collectors through the `analyze` harness (a live
// SourceCode) and asserts the JSX -> RenderedNode model directly.

import { describe, expect, it } from "vitest";

import { analyze, elementNamed } from "../testing/analyze.js";

import { collectContainerChildren, collectPlacement } from "./slots.js";

describe("collectContainerChildren", () => {
  function childrenOf(
    code: string,
    container: string,
  ): {
    names: string[];
    unknown: number;
    text: number;
    branches: string[][];
  } {
    return analyze(code, ({ sourceCode, filename, elements }) => {
      const root = collectContainerChildren(
        sourceCode,
        filename,
        elementNamed(elements, container),
      );

      return {
        names: root.children.map((child) => child.name),
        unknown: root.unknownRefs.length,
        text: root.textRefs.length,
        branches: root.children.map((child) => child.branches),
      };
    });
  }

  it("records direct element children as opaque nodes", () => {
    const result = childrenOf("const x = <Tray><A /><B /></Tray>;", "Tray");

    expect(result.names).toEqual(["A", "B"]);
  });

  it("flattens a fragment child", () => {
    const result = childrenOf(
      "const x = <Tray><><A /><B /></></Tray>;",
      "Tray",
    );

    expect(result.names).toEqual(["A", "B"]);
  });

  it("tags the two sides of a ternary with opposite branches", () => {
    const result = childrenOf(
      "const x = <Tray>{cond ? <A /> : <B />}</Tray>;",
      "Tray",
    );

    expect(result.names).toEqual(["A", "B"]);

    const [consequent, alternate] = result.branches;

    expect(consequent?.[0]?.endsWith(":consequent")).toBe(true);
    expect(alternate?.[0]?.endsWith(":alternate")).toBe(true);
    // Same conditional, opposite sides.
    expect(consequent?.[0]?.split(":")[0]).toBe(alternate?.[0]?.split(":")[0]);
  });

  it("drops the condition of a logical && but keeps the rendered side", () => {
    const result = childrenOf(
      "const x = <Tray>{show && <A />}</Tray>;",
      "Tray",
    );

    expect(result.names).toEqual(["A"]);
  });

  it("records non-whitespace text as a text ref and a call as unknown", () => {
    const result = childrenOf("const x = <Tray>hello {make()}</Tray>;", "Tray");

    expect(result.text).toBe(1);
    expect(result.unknown).toBe(1);
    expect(result.names).toEqual([]);
  });

  it("inlines a constant JSX-valued identifier", () => {
    const result = childrenOf(
      "const a = <A />;\nconst x = <Tray>{a}</Tray>;",
      "Tray",
    );

    expect(result.names).toEqual(["A"]);
  });

  it("inlines a shared constant at each of its references", () => {
    const result = childrenOf(
      "const a = <A />;\nconst x = <Tray>{a}{a}</Tray>;",
      "Tray",
    );

    expect(result.names).toEqual(["A", "A"]);
    expect(result.unknown).toBe(0);
  });

  it("degrades a self-referential constant to an unknown ref", () => {
    const result = childrenOf(
      "const a = <><B />{a}</>;\nconst x = <Tray>{a}</Tray>;",
      "Tray",
    );

    expect(result.names).toEqual(["B"]);
    expect(result.unknown).toBe(1);
  });

  it("bounds a doubling constant chain instead of expanding it", () => {
    const links = Array.from(
      { length: 18 },
      (_unused, index) => `const a${index + 1} = <>{a${index}}{a${index}}</>;`,
    ).join("\n");

    const result = childrenOf(
      `const a0 = <A />;\n${links}\nconst x = <Tray>{a18}</Tray>;`,
      "Tray",
    );

    // Inlining every reference is exponential in the chain's length, so the
    // budget cuts in and the rest of the content degrades to unknown.
    expect(result.names.length).toBeLessThan(2000);
    expect(result.unknown).toBeGreaterThan(0);
  });

  it("degrades a pair of mutually referential constants to an unknown ref", () => {
    const result = childrenOf(
      "const a = <><B />{b}</>;\nconst b = <><C />{a}</>;\nconst x = <Tray>{a}</Tray>;",
      "Tray",
    );

    expect(result.names).toEqual(["B", "C"]);
    expect(result.unknown).toBe(1);
  });
});

describe("collectPlacement", () => {
  it("reports a direct placement under the nearest element ancestor", () => {
    const placement = analyze(
      "const x = <Tray><Action /></Tray>;",
      ({ sourceCode, filename, elements }) =>
        collectPlacement(
          sourceCode,
          filename,
          elementNamed(elements, "Action"),
        ),
    );

    expect(placement).toMatchObject({
      kind: "direct",
      parent: { name: "Tray" },
    });
  });

  it("reports a hoisted placement with the ancestors of each read", () => {
    const placement = analyze(
      "const action = <Action />;\nconst x = <Tray>{action}</Tray>;",
      ({ sourceCode, filename, elements }) =>
        collectPlacement(
          sourceCode,
          filename,
          elementNamed(elements, "Action"),
        ),
    );

    expect(placement).toMatchObject({
      kind: "hoisted",
      parents: [{ name: "Tray" }],
    });
  });
});
