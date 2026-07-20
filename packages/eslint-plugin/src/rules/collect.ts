import { posix } from "node:path";

import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import type {
  AncestorFact,
  Branch,
  ParentFact,
  Placement,
  PropFact,
  RenderedNode,
  SubtreeElement,
  SubtreeNode,
} from "../contracts/facts.js";
import { memoized } from "../memo.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

const importSpecifierNodeTypes = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ImportSpecifier,
  AST_NODE_TYPES.ImportDefaultSpecifier,
  AST_NODE_TYPES.ImportNamespaceSpecifier,
]);

// Render no element of their own.
const transparentNodeTypes = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.JSXExpressionContainer,
  AST_NODE_TYPES.JSXFragment,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.ConditionalExpression,
]);

export function tagName(name: TSESTree.JSXTagNameExpression): string | null {
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return name.name;
  }

  if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
    const objectName = tagName(name.object);

    return objectName === null ? null : `${objectName}.${name.property.name}`;
  }

  return null;
}

function nearestSignificantAncestor(
  node: TSESTree.Node,
): TSESTree.Node | undefined {
  let ancestor = node.parent;

  while (ancestor !== undefined && transparentNodeTypes.has(ancestor.type)) {
    ancestor = ancestor.parent;
  }

  return ancestor;
}

function* scopeChain(
  scope: TSESLint.Scope.Scope,
): Generator<TSESLint.Scope.Scope> {
  for (
    let current: TSESLint.Scope.Scope | null = scope;
    current !== null;
    current = current.upper
  ) {
    yield current;
  }
}

/**
 * Per-file resolution state, built once and consulted by hash lookup. Scanning
 * a scope's reference list per identifier is quadratic in file size: a
 * JSX-heavy file puts every reference in one function scope, and collection
 * resolves many identifiers per element.
 */
interface ResolutionIndex {
  /** Every reference's identifier node → what it resolved to, unresolved as null. */
  resolved: Map<TSESTree.Node, TSESLint.Scope.Variable | null>;
  /** Each scope's declarations by name, built on first use of that scope. */
  declared: WeakMap<TSESLint.Scope.Scope, Map<string, TSESLint.Scope.Variable>>;
  /** Import specifier per tag-name node — an ancestor resolves once for the file. */
  importSources: Map<TSESTree.JSXTagNameExpression, string | null>;
}

const resolutionIndexes = new WeakMap<SourceCode, ResolutionIndex>();

function resolutionIndexFor(sourceCode: SourceCode): ResolutionIndex {
  return memoized(resolutionIndexes, sourceCode, () => {
    const resolved = new Map<TSESTree.Node, TSESLint.Scope.Variable | null>();

    // A reference lives in the scope it occurs in, which is always on the
    // scope chain the per-identifier scan walked; indexing every scope at once
    // is the same lookup without the scan.
    for (const scope of sourceCode.scopeManager?.scopes ?? []) {
      for (const reference of scope.references) {
        resolved.set(reference.identifier, reference.resolved);
      }
    }

    return { resolved, declared: new WeakMap(), importSources: new Map() };
  });
}

function declaredIn(
  index: ResolutionIndex,
  scope: TSESLint.Scope.Scope,
): Map<string, TSESLint.Scope.Variable> {
  return memoized(index.declared, scope, () => {
    const byName = new Map<string, TSESLint.Scope.Variable>();

    // First declaration wins, matching the `find` this replaces.
    for (const variable of scope.variables) {
      if (!byName.has(variable.name)) {
        byName.set(variable.name, variable);
      }
    }

    return byName;
  });
}

function resolveJsxVariable(
  sourceCode: SourceCode,
  identifier: TSESTree.JSXIdentifier,
): TSESLint.Scope.Variable | null {
  const index = resolutionIndexFor(sourceCode);
  const referenced = index.resolved.get(identifier);

  // Present but null is an unresolved reference, which the name pass below
  // never rescued either.
  if (referenced !== undefined) {
    return referenced;
  }

  // An intrinsic tag makes no reference at all, so fall back to the nearest
  // scope declaring the name.
  for (const current of scopeChain(sourceCode.getScope(identifier))) {
    const variable = declaredIn(index, current).get(identifier.name);

    if (variable !== undefined) {
      return variable;
    }
  }

  return null;
}

/**
 * The specifier a tag's root identifier is imported from, normalized against the
 * filename when relative. Null for a non-import. Memoized on the tag-name node:
 * an ancestor resolved once stays resolved for every descendant walking past
 * it. The memo does not key on `filename`, because it lives in the index of
 * the one `sourceCode` that filename belongs to.
 */
export function resolveImportSource(
  sourceCode: SourceCode,
  filename: string,
  name: TSESTree.JSXTagNameExpression,
): string | null {
  return memoized(resolutionIndexFor(sourceCode).importSources, name, () =>
    computeImportSource(sourceCode, filename, name),
  );
}

function computeImportSource(
  sourceCode: SourceCode,
  filename: string,
  name: TSESTree.JSXTagNameExpression,
): string | null {
  let root: TSESTree.JSXTagNameExpression = name;

  while (root.type === AST_NODE_TYPES.JSXMemberExpression) {
    root = root.object;
  }

  if (root.type !== AST_NODE_TYPES.JSXIdentifier) {
    return null;
  }

  const variable = resolveJsxVariable(sourceCode, root);
  const definition = variable?.defs[0];

  if (
    definition === undefined ||
    !importSpecifierNodeTypes.has(definition.node.type)
  ) {
    return null;
  }

  const declaration = definition.node.parent;

  if (
    declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
    typeof declaration.source.value !== "string"
  ) {
    return null;
  }

  let specifier = declaration.source.value;

  if (specifier.startsWith(".")) {
    specifier = posix.normalize(
      posix.join(posix.dirname(filename.replaceAll("\\", "/")), specifier),
    );
  }

  return specifier;
}

// The initializer of a single-definition, never-reassigned local; null
// otherwise.
function resolveConstantInit(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): TSESTree.Expression | null {
  const variable = resolutionIndexFor(sourceCode).resolved.get(identifier);
  const definition = variable?.defs[0];

  if (
    variable === null ||
    variable === undefined ||
    definition === undefined ||
    variable.defs.length !== 1 ||
    definition.node.type !== AST_NODE_TYPES.VariableDeclarator ||
    definition.node.init === null
  ) {
    return null;
  }

  const isReassigned = variable.references.some(
    (variableReference) =>
      variableReference.isWrite() && !variableReference.init,
  );

  return isReassigned ? null : definition.node.init;
}

// Absent only when literally `false`, `null`, or `undefined`. Exported — not
// through the package's "." barrel, so it stays private to consumers — solely
// for the cross-package agreement test, which reaches it via this package's
// built output to pin the helpers' re-encoding of this absence rule against it
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

// Descends transparent nodes, handing every other node to `visit` with the
// branch tags accumulated so far.
function descendTransparent(
  node: TSESTree.JSXChild | TSESTree.Expression,
  branches: Branch[],
  visit: (
    leaf: TSESTree.JSXChild | TSESTree.Expression,
    branches: Branch[],
  ) => void,
): void {
  switch (node.type) {
    case AST_NODE_TYPES.JSXFragment:
      for (const child of node.children) {
        descendTransparent(child, branches, visit);
      }

      return;

    case AST_NODE_TYPES.JSXExpressionContainer:
      if (node.expression.type !== AST_NODE_TYPES.JSXEmptyExpression) {
        descendTransparent(node.expression, branches, visit);
      }

      return;

    case AST_NODE_TYPES.ConditionalExpression:
      descendTransparent(
        node.consequent,
        [...branches, `${node.range[0]}:consequent`],
        visit,
      );

      descendTransparent(
        node.alternate,
        [...branches, `${node.range[0]}:alternate`],
        visit,
      );

      return;

    case AST_NODE_TYPES.LogicalExpression:
      // The left side of && is a condition, not rendered content.
      if (node.operator !== "&&") {
        descendTransparent(node.left, branches, visit);
      }

      descendTransparent(node.right, branches, visit);

      return;

    default:
      visit(node, branches);
  }
}

/**
 * How many constants one container's collection may inline. Inlining is per
 * reference, not per constant, so a chain of constants each naming its
 * predecessor twice doubles per link — content no hand-written container has,
 * but nothing in the language forbids. Past the budget the remaining
 * references degrade to unknown refs, which is what the collector already says
 * about content it cannot see through.
 */
const maxConstantExpansions = 1000;

/**
 * A container's direct rendered children, seen through transparent nodes and
 * resolved constants. Child elements are opaque: recorded, not recursed into.
 */
export function collectContainerChildren(
  sourceCode: SourceCode,
  filename: string,
  container: TSESTree.JSXElement,
): RenderedNode {
  const children: RenderedNode[] = [];
  const unknownRefs: TSESTree.Node[] = [];
  const textRefs: TSESTree.JSXText[] = [];

  // The inits currently on the descent stack — entered before descending and
  // left on the way out, so only a constant that reaches itself counts as a
  // cycle. A plain second reference to a shared constant is inlined again.
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

function parentFact(
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

/**
 * Where a slot element sits: its nearest significant ancestor, or — when it is
 * assigned to a variable — the ancestors of every read of that variable.
 */
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
