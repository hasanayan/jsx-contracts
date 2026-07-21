/** Matches an import specifier against a literal path or a `*`-glob. */
export type ImportMatcher = (specifier: string) => boolean;

export function createImportMatcher(importPath: string): ImportMatcher {
  if (!importPath.includes("*")) {
    return (specifier): boolean => specifier === importPath;
  }

  const body = importPath.replaceAll(/[.*+?^${}()|[\]\\]/g, (character) =>
    character === "*" ? ".*" : `\\${character}`,
  );

  const regExp = new RegExp(`^${body}$`);

  return (specifier): boolean => regExp.test(specifier);
}

/** A null source (not an import) matches any gate. */
export function matchesGate(
  matcher: ImportMatcher,
  importSource: string | null,
): boolean {
  return importSource === null || matcher(importSource);
}
