import { describe, expect, it } from "vitest";
import { deepCopy, deepFreeze } from "../../lib/deepCopy";

describe("deepCopy", () => {
  it("should rebuild nested objects so an edit cannot reach the original", () => {
    const original = { zoom: { min: 1, max: 4 } };

    deepCopy(original).zoom.max = 99;

    expect(original.zoom.max).toBe(4);
  });

  it("should rebuild nested arrays", () => {
    const original = { facingMode: ["user", "environment"] };

    deepCopy(original).facingMode.push("left");

    expect(original.facingMode).toEqual(["user", "environment"]);
  });

  it("should carry functions over by reference", () => {
    // A MockMediaDeviceInfo carries getCapabilities and toJSON. A copy that
    // dropped them would leave the settings snapshot unusable.
    const getCapabilities = () => ({ torch: true });

    const copy = deepCopy({ label: "Back Camera", getCapabilities });

    expect(copy.getCapabilities).toBe(getCapabilities);
    expect(copy.label).toBe("Back Camera");
  });

  it("should return primitives unchanged", () => {
    expect(deepCopy(null)).toBe(null);
    expect(deepCopy(undefined)).toBe(undefined);
    expect(deepCopy(4)).toBe(4);
    expect(deepCopy("environment")).toBe("environment");
  });
});

describe("deepFreeze", () => {
  it("should refuse a write to a nested value", () => {
    const frozen = deepFreeze({ device: { label: "Back Camera" } });

    expect(() => {
      frozen.device.label = "Front Camera";
    }).toThrow(TypeError);
  });

  it("should freeze arrays and the entries inside them", () => {
    const frozen = deepFreeze({ resolutions: [{ width: 640, height: 480 }] });

    expect(() => {
      frozen.resolutions[0].width = 1;
    }).toThrow(TypeError);
    expect(() => {
      frozen.resolutions.push({ width: 1, height: 1 });
    }).toThrow(TypeError);
  });

  it("should leave the object it was given usable for reads", () => {
    const frozen = deepFreeze({ device: { resolutions: [{ width: 640 }] } });

    expect(frozen.device.resolutions[0].width).toBe(640);
  });
});
