import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import type {
  Branch,
  SubtreeElement,
  SubtreeNode,
} from "../../contracts/rendered-tree/rendered-tree.js";

import { collectProps } from "./props.js";
import { resolveConstantInit, resolveImportSource } from "./resolution.js";
import { tagName } from "./tag-name.js";
import { descendTransparent } from "./transparent.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

/**
 * The lazy subtree rooted at `element`. Namespaced elements keep an empty name
 * so their props and descendants are still walked. Constants are not inlined:
 * each reference becomes a ref node the evaluator resolves.
 */
export function collectSubtreeRoot(
  sourceCode: SourceCode,
  filename: string,
  element: TSESTree.JSXElement,
): SubtreeElement {
  const initIds = new Map<TSESTree.Expression, number>();
  let nextInitId = 0;

  function initIdOf(init: TSESTree.Expression): number {
    let id = initIds.get(init);

    if (id === undefined) {
      id = nextInitId++;
      initIds.set(init, id);
    }

    return id;
  }

  // `branches` are the tags on the transparent path down to this element; its
  // own children start a fresh branch context.
  function buildNode(
    current: TSESTree.JSXElement,
    branches: Branch[],
  ): SubtreeElement {
    const propChildren: SubtreeNode[] = [];

    for (const attribute of current.openingElement.attributes) {
      if (attribute.type !== AST_NODE_TYPES.JSXAttribute) {
        continue;
      }

      const { value } = attribute;

      if (value?.type === AST_NODE_TYPES.JSXExpressionContainer) {
        if (value.expression.type !== AST_NODE_TYPES.JSXEmptyExpression) {
          descend(value.expression, propChildren);
        }
      } else if (value?.type === AST_NODE_TYPES.JSXElement) {
        descend(value, propChildren);
      }
    }

    const children: SubtreeNode[] = [];

    for (const child of current.children) {
      descend(child, children);
    }

    return {
      kind: "element",
      name: tagName(current.openingElement.name) ?? "",
      ref: current,
      branches,
      importSource: resolveImportSource(
        sourceCode,
        filename,
        current.openingElement.name,
      ),
      props: collectProps(sourceCode, current.openingElement),
      propChildren,
      children,
    };
  }

  function descend(
    node: TSESTree.JSXChild | TSESTree.Expression,
    target: SubtreeNode[],
  ): void {
    descendTransparent(node, [], (leaf, branches) => {
      switch (leaf.type) {
        case AST_NODE_TYPES.JSXElement:
          target.push(buildNode(leaf, branches));

          return;

        case AST_NODE_TYPES.Identifier: {
          if (leaf.name === "undefined") {
            return;
          }

          const init = resolveConstantInit(sourceCode, leaf);

          if (init === null) {
            target.push({ kind: "unknown" });

            return;
          }

          // Resolves one level, so nested constants become further refs.
          target.push({
            kind: "ref",
            initId: initIdOf(init),
            branches,
            resolve: (): SubtreeNode[] => {
              const produced: SubtreeNode[] = [];

              descend(init, produced);

              return produced;
            },
          });

          return;
        }

        // Text and literals render no element.
        case AST_NODE_TYPES.JSXText:
        case AST_NODE_TYPES.Literal:
          return;

        default:
          target.push({ kind: "unknown" });
      }
    });
  }

  return buildNode(element, []);
}
