import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import type { OpaqueRegion } from "../../contracts/rendered-tree/rendered-tree.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

const maxExprLength = 32;

// So a multiline expression stays one tidy token.
function abbreviate(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length > maxExprLength
    ? `${flat.slice(0, maxExprLength - 1)}…`
    : flat;
}

/** Classify an opaque child into its cause and the expression a message renders. */
export function classifyOpaqueRegion(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): OpaqueRegion {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const callee = abbreviate(sourceCode.getText(node.callee));
    const inner = node.arguments.length > 0 ? `${callee}(…)` : `${callee}()`;

    return { ref: node, cause: "dynamic-children", text: `{${inner}}` };
  }

  // A variable or member access is children handed through.
  const cause =
    node.type === AST_NODE_TYPES.MemberExpression ||
    node.type === AST_NODE_TYPES.Identifier
      ? "passthrough-children"
      : "unresolvable";

  return {
    ref: node,
    cause,
    text: `{${abbreviate(sourceCode.getText(node))}}`,
  };
}
