/** The `get`/`set` pair every memo here is built on — `Map` or `WeakMap` alike. */
export interface Cache<Key, Value> {
  get: (key: Key) => Value | undefined;
  set: (key: Key, value: Value) => unknown;
}

/**
 * Get-or-create against one cache: the shape every memo in the plugin is made
 * of. `Value` excludes `undefined` so a stored value is never mistaken for a
 * miss — `null` and `false` cache, `undefined` does not.
 *
 * It sits above both sides of the package: the core memoizes condition verdicts
 * and the adapter memoizes AST facts, and neither owns the shape.
 */
export function memoized<Key, Value extends NonNullable<unknown> | null>(
  cache: Cache<Key, Value>,
  key: Key,
  compute: () => Value,
): Value {
  const existing = cache.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const value = compute();

  cache.set(key, value);

  return value;
}
