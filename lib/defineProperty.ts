export function defineProperty<T extends Record<string | symbol | number, any>>(
  targetObject: T,
  property: keyof T,
  newValue: unknown,
): () => void {
  const original = targetObject[property];
  
  // Check if the property is configurable (WebKit might block this)
  const descriptor = Object.getOwnPropertyDescriptor(targetObject, property);
  const isConfigurable = !descriptor || descriptor.configurable !== false;
  
  if (!isConfigurable) {
    console.warn(`Cannot redefine non-configurable property: ${String(property)}`);
    return () => {}; // Return a no-op function
  }
  
  try {
    Object.defineProperty(targetObject, property, {
      writable: true,
      configurable: true,
      value: newValue,
    });
  } catch (error) {
    console.warn(`Failed to define property ${String(property)}:`, error);
    return () => {}; // Return a no-op function
  }

  return () => {
    try {
      Object.defineProperty(targetObject, property, {
        writable: true,
        configurable: true,
        value: original,
      });
    } catch (error) {
      console.warn(`Failed to restore property ${String(property)}:`, error);
    }
  };
}
