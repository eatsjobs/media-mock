/**
 * Defines a property on an object with fallback strategies for restrictive environments
 * @param targetObject - The object to define the property on
 * @param property - The property name
 * @param newValue - The new value to set
 * @returns A cleanup function to restore the original value
 */
export function defineProperty<T extends Record<string | symbol | number, any>>(
  targetObject: T,
  property: keyof T,
  newValue: unknown,
): () => void {
  const original = targetObject[property];
  let mockApplied = false;

  // Check if the property is configurable (WebKit might block this)
  const descriptor = Object.getOwnPropertyDescriptor(targetObject, property);
  const isConfigurable = !descriptor || descriptor.configurable !== false;

  if (!isConfigurable) {
    console.warn(
      `Cannot redefine non-configurable property: ${String(property)}. Attempting fallback strategy...`,
    );
    // Fallback: Try direct assignment
    try {
      targetObject[property] = newValue as T[keyof T];
      mockApplied = true;
      console.log(`Successfully mocked ${String(property)} via direct assignment`);
    } catch (fallbackError) {
      console.warn(
        `Fallback assignment also failed for ${String(property)}:`,
        fallbackError,
      );
      return () => {}; // Return a no-op function
    }
  } else {
    try {
      Object.defineProperty(targetObject, property, {
        writable: true,
        configurable: true,
        value: newValue,
      });
      mockApplied = true;
    } catch (error) {
      console.warn(
        `Object.defineProperty failed for ${String(property)}. Attempting fallback...`,
        error,
      );
      // Fallback: Try direct assignment when Object.defineProperty fails
      try {
        targetObject[property] = newValue as T[keyof T];
        mockApplied = true;
        console.log(`Successfully mocked ${String(property)} via direct assignment`);
      } catch (fallbackError) {
        console.error(
          `All mocking strategies failed for ${String(property)}:`,
          fallbackError,
        );
        return () => {}; // Return a no-op function
      }
    }
  }

  return () => {
    if (!mockApplied) return;

    try {
      Object.defineProperty(targetObject, property, {
        writable: true,
        configurable: true,
        value: original,
      });
    } catch (error) {
      // Fallback: Try direct assignment for restoration
      try {
        targetObject[property] = original as T[keyof T];
      } catch (fallbackError) {
        console.warn(
          `Failed to restore property ${String(property)} via both methods:`,
          fallbackError,
        );
      }
    }
  };
}
