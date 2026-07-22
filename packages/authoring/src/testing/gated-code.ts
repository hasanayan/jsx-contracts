/**
 * A gate matches on the element's own import, so fixture source has to import
 * what it renders. Every capitalized root tag is imported from the gate, which
 * keeps the fixtures themselves about the rule under test.
 */
export function importing(gate: string, code: string): string {
  const roots = [
    ...new Set(
      [...code.matchAll(/<([A-Z][\dA-Za-z]*)/g)].map(([, name]) => name),
    ),
  ];

  if (roots.length === 0) {
    return code;
  }

  return `import { ${roots.join(", ")} } from "${gate}";\n${code}`;
}
