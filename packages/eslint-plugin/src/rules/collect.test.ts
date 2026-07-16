// Drives the collectors with a live SourceCode (a flat Linter running a capture
// rule) and asserts the JSX -> RenderedNode model directly.

import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import type {
  SubtreeElement,
  SubtreeNode,
  SubtreeRef,
} from "../contracts/evaluate-subtree.js";

import {
  collectContainerChildren,
  collectPlacement,
  collectSubtreeRoot,
  resolveImportSource,
  tagName,
} from "./collect.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

interface Analysis {
  sourceCode: SourceCode;
  filename: string;
  elements: TSESTree.JSXElement[];
}

// Runs `compute` inside a rule, where scope analysis is live.
function analyze<T>(
  code: string,
  compute: (analysis: Analysis) => T,
  filename = "src/app.tsx",
): T {
  const linter = new Linter();
  const elements: TSESTree.JSXElement[] = [];
  // An array, not a scalar: TS doesn't track assignments inside the closure.
  const captured: T[] = [];

  linter.verify(
    code,
    {
      // Without a `files` pattern, `.ts`/`.tsx` match no flat config.
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: {
        probe: {
          rules: {
            capture: {
              create(context) {
                const sourceCode = context.sourceCode as unknown as SourceCode;

                return {
                  JSXElement(node: TSESTree.JSXElement): void {
                    elements.push(node);
                  },
                  "Program:exit"(): void {
                    captured.push(
                      compute({
                        sourceCode,
                        filename: context.filename,
                        elements,
                      }),
                    );
                  },
                };
              },
            },
          },
        },
      },
      rules: { "probe/capture": "error" },
    },
    filename,
  );

  const [result] = captured;

  if (result === undefined) {
    throw new Error("capture rule did not run");
  }

  return result;
}

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

function elementNamed(
  elements: TSESTree.JSXElement[],
  name: string,
): TSESTree.JSXElement {
  const found = elements.find(
    (element) => tagName(element.openingElement.name) === name,
  );

  if (found === undefined) {
    throw new Error(`no <${name}> in fixture`);
  }

  return found;
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
