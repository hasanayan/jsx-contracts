export interface Cache<Key, Value> {
  get: (key: Key) => Value | undefined;
  set: (key: Key, value: Value) => unknown;
}

/**
 * Get-or-create against one cache. `Value` excludes `undefined` so a stored
 * value is never mistaken for a miss — `null` and `false` cache, `undefined`
 * does not.
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
