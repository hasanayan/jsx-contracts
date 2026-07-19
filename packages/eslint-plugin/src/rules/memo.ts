// Shared caching for the facet rules and their granular variants, so enabling
// all of them costs one analysis per file, not one per enabled rule.

/**
 * Content-keyed interning. ESLint deep-clones rule options for every rule and
 * every file, so object identity can never key a shared cache. Interning maps
 * each clone with the same JSON content onto the first-seen instance, and the
 * weak caches below key on that canonical object. The map lives for the
 * process and holds one entry per distinct payload content — a handful for
 * any real config.
 */
export function createInterner<Options extends object>(): (
  options: Options,
) => Options {
  const canonical = new Map<string, Options>();

  return (options) => {
    const key = JSON.stringify(options);
    const existing = canonical.get(key);

    if (existing !== undefined) {
      return existing;
    }

    canonical.set(key, options);

    return options;
  };
}

// Two-level weak memo: AST node → canonical options → result. Rule options
// are interned above, so every granular variant of a facet lands on the same
// second-level key and the per-element work runs once. Both levels are weakly
// held: entries die with the AST and the canonical payload.

export type NodeMemo<Result> = (
  node: object,
  options: object,
  compute: () => Result,
) => Result;

export function createNodeMemo<Result>(): NodeMemo<Result> {
  const cache = new WeakMap<object, WeakMap<object, Result>>();

  return (node, options, compute) => {
    let byOptions = cache.get(node);

    if (byOptions === undefined) {
      byOptions = new WeakMap();
      cache.set(node, byOptions);
    }

    const cached = byOptions.get(options);

    if (cached !== undefined || byOptions.has(options)) {
      return cached as Result;
    }

    const result = compute();

    byOptions.set(options, result);

    return result;
  };
}
