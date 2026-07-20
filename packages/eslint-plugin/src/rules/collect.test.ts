// Drives the collectors through the `analyze` harness (a live SourceCode) and
// asserts the JSX -> RenderedNode model directly.

import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { describe, expect, it } from "vitest";

import type {
  PropFact,
  SubtreeElement,
  SubtreeNode,
  SubtreeRef,
} from "../contracts/facts.js";

import { analyze, elementNamed } from "./analyze.js";
import {
  collectAncestors,
  collectContainerChildren,
  collectPlacement,
  collectProps,
  collectSubtreeRoot,
  hasSpreadAttribute,
  isAttributePresent,
  resolveImportSource,
} from "./collect.js";

// Narrowing helpers that throw, so tests read without conditional assertions.
function asElement(node: SubtreeNode | undefined): SubtreeElement {
  if (node?.kind !== "element") {
    throw new Error("expected an element node");
  }

  return node;
}

function asRef(node: SubtreeNode | undefined): SubtreeRef {
  if (node?.kind !== "ref") {
    throw new Error("expected a ref node");
  }

  return node;
}

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

describe("isAttributePresent", () => {
  function presenceOf(attribute: string): boolean {
    return analyze(`const x = <Widget ${attribute} />;`, ({ elements }) => {
      const [written] = elementNamed(elements, "Widget").openingElement
        .attributes;

      if (written?.type !== AST_NODE_TYPES.JSXAttribute) {
        throw new Error("expected a written attribute");
      }

      return isAttributePresent(written.value);
    });
  }

  it("counts a bare, string-valued or truthy attribute as present", () => {
    expect(presenceOf("open")).toBe(true);
    expect(presenceOf('label="hi"')).toBe(true);
    expect(presenceOf("open={true}")).toBe(true);
    expect(presenceOf("count={0}")).toBe(true);
  });

  it("counts only false, null and undefined as absent", () => {
    expect(presenceOf("open={false}")).toBe(false);
    expect(presenceOf("open={null}")).toBe(false);
    expect(presenceOf("open={undefined}")).toBe(false);
  });

  it("counts an unresolvable expression as present", () => {
    expect(presenceOf("open={maybe}")).toBe(true);
  });
});

describe("collectProps", () => {
  function factsOf(attributes: string): Map<string, PropFact> {
    return analyze(
      `const x = <Widget ${attributes} />;`,
      ({ sourceCode, elements }) =>
        new Map(
          collectProps(
            sourceCode,
            elementNamed(elements, "Widget").openingElement,
          ).map((fact) => [fact.name, fact]),
        ),
    );
  }

  it("resolves the literal arms: string, number and boolean", () => {
    const facts = factsOf('label="hi" size={2} open={true} shut={false}');

    expect(facts.get("label")?.value).toBe("hi");
    expect(facts.get("size")?.value).toBe(2);
    expect(facts.get("open")?.value).toBe(true);
    expect(facts.get("shut")?.value).toBe(false);
  });

  it("resolves a template literal with no substitutions", () => {
    const facts = factsOf("label={`hi`}");

    expect(facts.get("label")?.value).toBe("hi");
  });

  it("leaves a substituted template literal unresolved", () => {
    // The `${` is split, so this file's own lint does not read the fixture as
    // a mis-quoted template.
    const facts = factsOf("label={`hi $" + "{who}`}");

    expect(facts.get("label")?.value).toBeUndefined();
    expect(facts.get("label")?.source).toBeUndefined();
    expect(facts.get("label")?.present).toBe(true);
  });

  it("records an identifier or member expression as source text", () => {
    const facts = factsOf("size={Size.large} tone={tone}");

    expect(facts.get("size")?.source).toBe("Size.large");
    expect(facts.get("tone")?.source).toBe("tone");
  });

  it("skips spreads and namespaced attribute names", () => {
    const facts = factsOf("{...rest} xlink:href='#a' label='hi'");

    expect([...facts.keys()]).toEqual(["label"]);
  });
});

describe("hasSpreadAttribute", () => {
  function spreadOn(attributes: string): boolean {
    return analyze(`const x = <Widget ${attributes} />;`, ({ elements }) =>
      hasSpreadAttribute(elementNamed(elements, "Widget").openingElement),
    );
  }

  it("is true only when the element carries a spread", () => {
    expect(spreadOn("{...rest}")).toBe(true);
    expect(spreadOn('label="hi" {...rest}')).toBe(true);
    expect(spreadOn('label="hi"')).toBe(false);
  });
});

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

describe("collectSubtreeRoot", () => {
  it("recurses into body children and prop children", () => {
    const result = analyze(
      "const x = <Widget header={<A />}><B /></Widget>;",
      ({ sourceCode, filename, elements }) =>
        collectSubtreeRoot(
          sourceCode,
          filename,
          elementNamed(elements, "Widget"),
        ),
    );

    expect(result.propChildren.map((child) => asElement(child).name)).toEqual([
      "A",
    ]);

    expect(result.children.map((child) => asElement(child).name)).toEqual([
      "B",
    ]);
  });

  it("collects prop facts: presence, resolved value and member source", () => {
    const result = analyze(
      'const x = <Widget to open={false} size={Size.large} label="hi" />;',
      ({ sourceCode, filename, elements }) =>
        collectSubtreeRoot(
          sourceCode,
          filename,
          elementNamed(elements, "Widget"),
        ),
    );

    const byName = new Map(result.props.map((fact) => [fact.name, fact]));

    expect(byName.get("to")?.present).toBe(true);
    expect(byName.get("open")?.present).toBe(false);
    expect(byName.get("size")?.source).toBe("Size.large");
    expect(byName.get("label")?.value).toBe("hi");
  });

  it("emits a lazy ref for a constant identifier, keyed by its init", () => {
    const result = analyze(
      "const a = <A />;\nconst x = <Widget><Box>{a}</Box><Box>{a}</Box></Widget>;",
      ({ sourceCode, filename, elements }) =>
        collectSubtreeRoot(
          sourceCode,
          filename,
          elementNamed(elements, "Widget"),
        ),
    );

    // Neither reference is inlined; each Box holds one ref node.
    const refs = result.children.map((box) =>
      asRef(asElement(box).children[0]),
    );

    expect(refs).toHaveLength(2);
    // Same constant, so same initId; resolving yields its content on demand.
    expect(refs[0]?.initId).toBe(refs[1]?.initId);
    expect(asElement(asRef(refs[0]).resolve()[0]).name).toBe("A");
  });
});

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
