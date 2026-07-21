import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import type { PropFact } from "../../contracts/rendered-tree/rendered-tree.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

// Absent only when literally `false`, `null`, or `undefined`. Exported — not
// through the package's "." barrel, so it stays private to consumers — solely
// for the cross-package agreement test, which reaches it via this package's
// built output to pin the authoring package's re-encoding of this absence rule against it
// (see docs/adr/0002-*).
export function isAttributePresent(
  value: TSESTree.JSXAttribute["value"],
): boolean {
  if (value === null) {
    return true;
  }

  if (value.type !== AST_NODE_TYPES.JSXExpressionContainer) {
    return true;
  }

  const { expression } = value;

  if (
    expression.type === AST_NODE_TYPES.Literal &&
    (expression.value === false || expression.value === null)
  ) {
    return false;
  }

  return !(
    expression.type === AST_NODE_TYPES.Identifier &&
    expression.name === "undefined"
  );
}

function propFact(
  sourceCode: SourceCode,
  attribute: TSESTree.JSXAttribute,
  name: string,
): PropFact {
  const fact: PropFact = {
    name,
    present: isAttributePresent(attribute.value),
    ref: attribute,
  };

  const { value } = attribute;

  if (value === null) {
    return fact;
  }

  if (value.type === AST_NODE_TYPES.Literal) {
    if (typeof value.value === "string") {
      fact.value = value.value;
    }

    return fact;
  }

  if (value.type !== AST_NODE_TYPES.JSXExpressionContainer) {
    return fact;
  }

  const { expression } = value;

  if (expression.type === AST_NODE_TYPES.Literal) {
    const literal = expression.value;

    if (
      typeof literal === "string" ||
      typeof literal === "number" ||
      typeof literal === "boolean"
    ) {
      fact.value = literal;
    }

    return fact;
  }

  if (
    expression.type === AST_NODE_TYPES.TemplateLiteral &&
    expression.expressions.length === 0
  ) {
    const cooked = expression.quasis[0]?.value.cooked;

    if (typeof cooked === "string") {
      fact.value = cooked;
    }

    return fact;
  }

  if (
    expression.type === AST_NODE_TYPES.MemberExpression ||
    expression.type === AST_NODE_TYPES.Identifier
  ) {
    fact.source = sourceCode.getText(expression);
  }

  return fact;
}

export function collectProps(
  sourceCode: SourceCode,
  openingElement: TSESTree.JSXOpeningElement,
): PropFact[] {
  const props: PropFact[] = [];

  for (const attribute of openingElement.attributes) {
    if (
      attribute.type === AST_NODE_TYPES.JSXAttribute &&
      attribute.name.type === AST_NODE_TYPES.JSXIdentifier
    ) {
      props.push(propFact(sourceCode, attribute, attribute.name.name));
    }
  }

  return props;
}

/** Whether the element carries a `{...spread}`, making an absence unprovable. */
export function hasSpreadAttribute(
  openingElement: TSESTree.JSXOpeningElement,
): boolean {
  return openingElement.attributes.some(
    (attribute) => attribute.type === AST_NODE_TYPES.JSXSpreadAttribute,
  );
}
