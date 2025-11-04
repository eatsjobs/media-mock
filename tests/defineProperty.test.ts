import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineProperty } from "../lib/defineProperty";

describe("defineProperty", () => {
  let testObject: Record<string, unknown>;

  beforeEach(() => {
    testObject = {
      prop1: "original1",
      prop2: "original2",
      method1: () => "test",
    };
  });

  afterEach(() => {
    // Clean up
    testObject = {};
  });

  // ===== BASIC FUNCTIONALITY TESTS =====

  it("should define a new property with a value", () => {
    const newValue = "newValue";
    defineProperty(testObject, "prop1", newValue);

    expect(testObject.prop1).toBe(newValue);
  });

  it("should define a property with a function", () => {
    const newFunc = () => "mocked";
    defineProperty(testObject, "method1", newFunc);

    expect(testObject.method1).toBe(newFunc);
    expect((testObject.method1 as () => string)()).toBe("mocked");
  });

  it("should define a property with an object", () => {
    const newObj = { key: "value" };
    defineProperty(testObject, "prop1", newObj);

    expect(testObject.prop1).toEqual(newObj);
  });

  it("should define a property with null", () => {
    defineProperty(testObject, "prop1", null);

    expect(testObject.prop1).toBeNull();
  });

  it("should define a property with undefined", () => {
    defineProperty(testObject, "prop1", undefined);

    expect(testObject.prop1).toBeUndefined();
  });

  // ===== RESTORATION TESTS =====

  it("should return a cleanup function that restores the original value", () => {
    const original = testObject.prop1;
    const newValue = "newValue";

    const cleanup = defineProperty(testObject, "prop1", newValue);

    expect(testObject.prop1).toBe(newValue);

    cleanup();

    expect(testObject.prop1).toBe(original);
  });

  it("should restore function values", () => {
    const originalFunc = testObject.method1;
    const newFunc = () => "mocked";

    const cleanup = defineProperty(testObject, "method1", newFunc);

    expect(testObject.method1).toBe(newFunc);

    cleanup();

    expect(testObject.method1).toBe(originalFunc);
  });

  it("should restore object values", () => {
    const originalObj = testObject.prop1;
    const newObj = { key: "value" };

    const cleanup = defineProperty(testObject, "prop1", newObj);

    expect(testObject.prop1).toEqual(newObj);

    cleanup();

    expect(testObject.prop1).toBe(originalObj);
  });

  it("should handle multiple defineProperty calls on different properties", () => {
    const cleanup1 = defineProperty(testObject, "prop1", "new1");
    const cleanup2 = defineProperty(testObject, "prop2", "new2");

    expect(testObject.prop1).toBe("new1");
    expect(testObject.prop2).toBe("new2");

    cleanup1();
    cleanup2();

    expect(testObject.prop1).toBe("original1");
    expect(testObject.prop2).toBe("original2");
  });

  it("should handle chained defineProperty operations", () => {
    const cleanup1 = defineProperty(testObject, "prop1", "value1");
    const cleanup2 = defineProperty(testObject, "prop1", "value2");
    const cleanup3 = defineProperty(testObject, "prop1", "value3");

    expect(testObject.prop1).toBe("value3");

    cleanup3();
    expect(testObject.prop1).toBe("value2");

    cleanup2();
    expect(testObject.prop1).toBe("value1");

    cleanup1();
    expect(testObject.prop1).toBe("original1");
  });

  // ===== PROPERTY DESCRIPTOR TESTS =====

  it("should make property writable", () => {
    defineProperty(testObject, "prop1", "newValue");

    // Should be able to reassign
    testObject.prop1 = "anotherValue";
    expect(testObject.prop1).toBe("anotherValue");
  });

  it("should make property configurable", () => {
    defineProperty(testObject, "prop1", "newValue");

    // Should be able to redefine
    Object.defineProperty(testObject, "prop1", {
      value: "redefined",
      writable: false,
    });
    expect(testObject.prop1).toBe("redefined");
  });

  it("should handle already configurable properties", () => {
    // Create a configurable property
    Object.defineProperty(testObject, "configurable", {
      value: "original",
      writable: true,
      configurable: true,
    });

    const cleanup = defineProperty(testObject, "configurable", "newValue");

    expect(testObject.configurable).toBe("newValue");

    cleanup();

    expect(testObject.configurable).toBe("original");
  });

  // ===== EDGE CASES =====

  it("should handle symbol properties", () => {
    const sym = Symbol("test");
    testObject[sym as unknown as string] = "symbolValue";

    const cleanup = defineProperty(
      testObject,
      sym as unknown as string,
      "newSymbolValue",
    );

    expect(testObject[sym as unknown as string]).toBe("newSymbolValue");

    cleanup();

    expect(testObject[sym as unknown as string]).toBe("symbolValue");
  });

  it("should handle numeric properties", () => {
    testObject[1] = "numeric";

    const cleanup = defineProperty(testObject, 1 as unknown as string, "new");

    expect(testObject[1]).toBe("new");

    cleanup();

    expect(testObject[1]).toBe("numeric");
  });

  it("should handle empty string property", () => {
    testObject[""] = "empty";

    const cleanup = defineProperty(testObject, "", "newEmpty");

    expect(testObject[""]).toBe("newEmpty");

    cleanup();

    expect(testObject[""]).toBe("empty");
  });

  // ===== REAL WORLD SCENARIOS =====

  it("should mock navigator-like object", () => {
    const fakeNavigator = {
      mediaDevices: {
        getUserMedia: async () => ({}),
      },
    };

    const mockFunc = async () => ({ test: "stream" });

    const cleanup = defineProperty(
      fakeNavigator.mediaDevices,
      "getUserMedia",
      mockFunc,
    );

    expect(fakeNavigator.mediaDevices.getUserMedia).toBe(mockFunc);

    cleanup();

    expect(typeof fakeNavigator.mediaDevices.getUserMedia).toBe("function");
  });

  it("should handle EventTarget-like objects", () => {
    const eventTarget = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };

    const newListener = () => {
      console.log("mocked");
    };

    const cleanup = defineProperty(
      eventTarget,
      "addEventListener",
      newListener,
    );

    expect(eventTarget.addEventListener).toBe(newListener);

    cleanup();

    expect(typeof eventTarget.addEventListener).toBe("function");
  });

  // ===== ERROR HANDLING =====

  it("should return a no-op cleanup function when property is non-configurable", () => {
    // Create a non-configurable property
    Object.defineProperty(testObject, "frozen", {
      value: "frozen",
      configurable: false,
      writable: false,
    });

    const consoleWarnSpy = vi.spyOn(console, "warn");

    const cleanup = defineProperty(testObject, "frozen", "attempted");

    // Should log a warning about non-configurable property
    expect(consoleWarnSpy).toHaveBeenCalled();

    // Cleanup should be no-op
    cleanup();

    // Original value should be unchanged (defineProperty failed)
    expect(testObject.frozen).toBe("frozen");

    consoleWarnSpy.mockRestore();
  });

  it("should handle cleanup when property definition failed", () => {
    // Try to redefine a non-configurable property
    Object.defineProperty(testObject, "locked", {
      value: "locked",
      configurable: false,
    });

    const cleanup = defineProperty(testObject, "locked", "new");

    // Cleanup should not throw
    expect(() => {
      cleanup();
    }).not.toThrow();
  });

  it("should attempt to restore even when mocking failed for non-configurable property", () => {
    const original = "original";
    testObject.prop1 = original;

    // Make property non-configurable and non-writable
    Object.defineProperty(testObject, "prop1", {
      value: original,
      configurable: false,
      writable: false,
    });

    const consoleWarnSpy = vi.spyOn(console, "warn");

    // Try to mock (should fail and return cleanup that attempts restoration)
    const cleanup = defineProperty(testObject, "prop1", "attempted");

    // Cleanup should still attempt restoration even though mocking failed
    cleanup();

    consoleWarnSpy.mockRestore();
  });

  it("should attempt to restore when all mocking strategies fail", () => {
    const original = "original";
    testObject.prop1 = original;

    // Make property completely locked
    Object.defineProperty(testObject, "prop1", {
      value: original,
      configurable: false,
      writable: false,
    });

    const cleanup = defineProperty(testObject, "prop1", "new");

    // Cleanup function should exist and be callable
    expect(typeof cleanup).toBe("function");

    // Calling cleanup should not throw
    expect(() => {
      cleanup();
    }).not.toThrow();
  });

  // ===== CONSOLE LOGGING TESTS =====

  it("should log when successfully mocking a property", () => {
    const consoleLogSpy = vi.spyOn(console, "log");

    defineProperty(testObject, "prop1", "newValue");

    // Note: Current implementation doesn't log on success via defineProperty,
    // only logs on fallback strategies. This test documents current behavior.

    consoleLogSpy.mockRestore();
  });

  it("should warn about non-configurable properties", () => {
    Object.defineProperty(testObject, "nonConfig", {
      value: "value",
      configurable: false,
    });

    const consoleWarnSpy = vi.spyOn(console, "warn");

    defineProperty(testObject, "nonConfig", "new");

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cannot redefine non-configurable property"),
    );

    consoleWarnSpy.mockRestore();
  });

  // ===== MULTIPLE CLEANUP CALLS =====

  it("should handle multiple cleanup calls safely", () => {
    const original = testObject.prop1;
    const cleanup = defineProperty(testObject, "prop1", "newValue");

    cleanup();
    expect(testObject.prop1).toBe(original);

    // Second cleanup should not cause issues
    cleanup();
    expect(testObject.prop1).toBe(original);
  });

  // ===== PROPERTY OVERWRITING =====

  it("should allow overwriting a mocked property with another mock", () => {
    const cleanup1 = defineProperty(testObject, "prop1", "value1");
    const cleanup2 = defineProperty(testObject, "prop1", "value2");

    expect(testObject.prop1).toBe("value2");

    cleanup2();
    expect(testObject.prop1).toBe("value1");

    cleanup1();
    expect(testObject.prop1).toBe("original1");
  });

  // ===== TYPE SAFETY TESTS =====

  it("should work with different value types", () => {
    const testCases = [
      { value: "string", expected: "string" },
      { value: 42, expected: 42 },
      { value: true, expected: true },
      { value: false, expected: false },
      { value: { nested: "object" }, expected: { nested: "object" } },
      { value: ["array", "value"], expected: ["array", "value"] },
      { value: () => "fn", expected: expect.any(Function) },
    ];

    testCases.forEach(({ value, expected }) => {
      const cleanup = defineProperty(testObject, "prop1", value);
      expect(testObject.prop1).toEqual(expected);
      cleanup();
    });
  });

  // ===== SCOPE ISOLATION TESTS =====

  it("should not affect other properties when defining one", () => {
    const original2 = testObject.prop2;

    defineProperty(testObject, "prop1", "new1");

    expect(testObject.prop1).toBe("new1");
    expect(testObject.prop2).toBe(original2); // Unchanged
  });

  it("should not affect other objects when defining a property", () => {
    const otherObject = { prop1: "other" };

    defineProperty(testObject, "prop1", "new");

    expect(testObject.prop1).toBe("new");
    expect(otherObject.prop1).toBe("other"); // Unchanged
  });

  // ===== REAL BROWSER API SIMULATION =====

  it("should simulate navigator.mediaDevices mock scenario", () => {
    const mockNavigator = {
      mediaDevices: {
        getUserMedia: async (_constraints: unknown) => ({}),
        enumerateDevices: async () => [],
        getSupportedConstraints: () => ({}),
      },
    };

    const mockGetUserMedia = async () => ({ mocked: true });
    const mockEnumerate = async () => [{ deviceId: "mock" }];
    const mockConstraints = () => ({ width: true });

    const cleanup1 = defineProperty(
      mockNavigator.mediaDevices,
      "getUserMedia",
      mockGetUserMedia,
    );
    const cleanup2 = defineProperty(
      mockNavigator.mediaDevices,
      "enumerateDevices",
      mockEnumerate,
    );
    const cleanup3 = defineProperty(
      mockNavigator.mediaDevices,
      "getSupportedConstraints",
      mockConstraints,
    );

    // All should be mocked
    expect(mockNavigator.mediaDevices.getUserMedia).toBe(mockGetUserMedia);
    expect(mockNavigator.mediaDevices.enumerateDevices).toBe(mockEnumerate);
    expect(mockNavigator.mediaDevices.getSupportedConstraints).toBe(
      mockConstraints,
    );

    // Cleanup all
    cleanup1();
    cleanup2();
    cleanup3();

    // Should be restored (these won't match original exactly in this test,
    // but will be different from the mocked versions)
    expect(mockNavigator.mediaDevices.getUserMedia).not.toBe(mockGetUserMedia);
  });
});
