// The value cached under key, computed and cached on first use. Works with a Map or a WeakMap.
export function getOrSet<K, V>(
  cache: { get(key: K): V | undefined; set(key: K, value: V): unknown },
  key: K,
  compute: () => V,
): V {
  let value = cache.get(key);
  if (value === undefined) {
    value = compute();
    cache.set(key, value);
  }
  return value;
}
