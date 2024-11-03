export function defineProperty<T extends Record<string | symbol | number, any>>(
  targetObject: T,
  property: keyof T,
  newValue: unknown
): () => void {
  const original = targetObject[property];
  Object.defineProperty(targetObject, property, {
    writable: true,
    configurable: true,
    value: newValue,
  });

  return () => {
    Object.defineProperty(targetObject, property, {
      writable: true,
      configurable: true,
      value: original,
    });
  };
}
