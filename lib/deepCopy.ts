/**
 * Structural copying and freezing for the plain data this library hands out.
 *
 * `structuredClone` would cover the copying, but it landed in Node 17 and in
 * browsers only in early 2022 — the package still declares `node >= 16` — and
 * it throws on the functions a `MockMediaDeviceInfo` carries. Both are shapes
 * this library has to support, so it does the walk itself.
 *
 * No DOM access: unit-tested in node.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * A copy with every plain object and array rebuilt, so an edit to the result
 * cannot reach the original. Everything else — primitives, functions, class
 * instances — is carried over by reference.
 *
 * @export
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => deepCopy(entry)) as T;
  }

  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      copy[key] = deepCopy(value[key]);
    }
    return copy as T;
  }

  return value;
}

/**
 * Freezes `value` along with every plain object and array reachable from it, so
 * a write at any depth throws in strict mode.
 *
 * Only ever freeze a copy: freezing live state would break the very methods
 * that maintain it.
 *
 * @export
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value) || isPlainObject(value)) {
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
    Object.freeze(value);
  }

  return value;
}
