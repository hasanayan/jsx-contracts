import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import type {
  Branch,
  Placement,
  RenderedNode,
} from "../../contracts/rendered-tree/rendered-tree.js";

import { parentFact } from "./ancestors.js";
import { resolveConstantInit, resolveImportSource } from "./resolution.js";
import { nearestSignificantAncestor, tagName } from "./tag-name.js";
import { descendTransparent } from "./transparent.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

/**
 * Inlining is per reference, so a chain of constants each naming its predecessor
 * twice doubles per link. Past the budget the rest degrade to unknown refs.
 */
const maxConstantExpansions = 1000;

/** Child elements are opaque: recorded, not recursed into. */
export function collectContainerChildren(
  sourceCode: SourceCode,
  filename: string,
  container: TSESTree.JSXElement,
): RenderedNode {
  const children: RenderedNode[] = [];
  const unknownRefs: TSESTree.Node[] = [];
  const textRefs: TSESTree.JSXText[] = [];

  // On the descent stack, so only a constant reaching itself counts as a cycle;
  // a second reference to a shared constant is inlined again.
  const inFlightInits = new Set<TSESTree.Expression>();
  let expansionsLeft = maxConstantExpansions;

  function visitLeaf(
    node: TSESTree.JSXChild | TSESTree.Expression,
    branches: Branch[],
  ): void {
    switch (node.type) {
      case AST_NODE_TYPES.JSXElement: {
        const name = tagName(node.openingElement.name);

        // Namespaced elements (e.g. <svg:rect>) have no name.
        if (name !== null) {
          children.push({
            name,
            ref: node,
            branches,
            importSource: resolveImportSource(
              sourceCode,
              filename,
              node.openingElement.name,
            ),
            children: [],
            unknownRefs: [],
            textRefs: [],
          });
        }

        return;
      }

      case AST_NODE_TYPES.Identifier: {
        if (node.name === "undefined") {
          return;
        }

        const init = resolveConstantInit(sourceCode, node);

        if (init === null || inFlightInits.has(init) || expansionsLeft === 0) {
          unknownRefs.push(node);

          return;
        }

        expansionsLeft -= 1;
        inFlightInits.add(init);
        descendTransparent(init, branches, visitLeaf);
        inFlightInits.delete(init);

        return;
      }

      case AST_NODE_TYPES.JSXText:
        if (node.value.trim() !== "") {
          textRefs.push(node);
        }

        return;

      case AST_NODE_TYPES.Literal:
        return;

      default:
        unknownRefs.push(node);
    }
  }

  for (const child of container.children) {
    descendTransparent(child, [], visitLeaf);
  }

  return {
    name: tagName(container.openingElement.name) ?? "",
    ref: container,
    branches: [],
    importSource: resolveImportSource(
      sourceCode,
      filename,
      container.openingElement.name,
    ),
    children,
    unknownRefs,
    textRefs,
  };
}

/** The nearest significant ancestor, or the ancestors of every read of its variable. */
export function collectPlacement(
  sourceCode: SourceCode,
  filename: string,
  slotElement: TSESTree.JSXElement,
): Placement {
  const ancestor = nearestSignificantAncestor(slotElement);

  if (ancestor?.type !== AST_NODE_TYPES.VariableDeclarator) {
    return {
      kind: "direct",
      parent: parentFact(sourceCode, filename, ancestor),
    };
  }

  const variables = sourceCode.getDeclaredVariables(ancestor);
  const variable = variables[0];

  if (variables.length !== 1 || variable === undefined) {
    return { kind: "hoisted", parents: [] };
  }

  const reads = variable.references.filter((reference) => reference.isRead());

  return {
    kind: "hoisted",
    parents: reads.map((reference) =>
      parentFact(
        sourceCode,
        filename,
        nearestSignificantAncestor(reference.identifier),
      ),
    ),
  };
}
