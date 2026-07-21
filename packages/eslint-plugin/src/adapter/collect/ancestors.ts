import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import type {
  AncestorFact,
  ParentFact,
} from "../../contracts/rendered-tree/rendered-tree.js";

import { resolveImportSource } from "./resolution.js";
import { tagName } from "./tag-name.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

/**
 * The chain of JSX-element ancestors enclosing an element, innermost-first.
 * Containment is syntactic: body children and JSX-valued props both count.
 * Namespaced ancestors are dropped, and hoisting is not followed.
 */
export function collectAncestors(
  sourceCode: SourceCode,
  filename: string,
  element: TSESTree.JSXElement,
): AncestorFact[] {
  const ancestors: AncestorFact[] = [];

  // `.parent` is typed non-nullable, so the walk terminates at Program.
  for (
    let current: TSESTree.Node = element.parent;
    ;
    current = current.parent
  ) {
    if (current.type === AST_NODE_TYPES.JSXElement) {
      const name = tagName(current.openingElement.name);

      if (name !== null) {
        ancestors.push({
          name,
          importSource: resolveImportSource(
            sourceCode,
            filename,
            current.openingElement.name,
          ),
        });
      }
    }

    if (current.type === AST_NODE_TYPES.Program) {
      break;
    }
  }

  return ancestors;
}

export function parentFact(
  sourceCode: SourceCode,
  filename: string,
  ancestor: TSESTree.Node | undefined,
): ParentFact {
  if (ancestor?.type !== AST_NODE_TYPES.JSXElement) {
    return null;
  }

  const name = tagName(ancestor.openingElement.name);

  if (name === null) {
    return null;
  }

  return {
    name,
    importSource: resolveImportSource(
      sourceCode,
      filename,
      ancestor.openingElement.name,
    ),
  };
}
