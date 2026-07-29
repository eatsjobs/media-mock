import { describe, expect, it } from "vitest";
import {
  extractDeviceId,
  extractFacingMode,
  extractFrameRate,
  extractRequestedSize,
} from "../../lib/constraints";

describe("extractFrameRate", () => {
  it("should default to 30 when no video constraints are given", () => {
    expect(extractFrameRate({ video: true })).toBe(30);
    expect(extractFrameRate({})).toBe(30);
  });

  it("should read a plain number", () => {
    expect(extractFrameRate({ video: { frameRate: 15 } })).toBe(15);
  });

  it("should prefer exact over ideal and max", () => {
    expect(
      extractFrameRate({
        video: { frameRate: { exact: 25, ideal: 10, max: 60 } },
      }),
    ).toBe(25);
  });

  it("should fall back through ideal then max", () => {
    expect(
      extractFrameRate({ video: { frameRate: { ideal: 24, max: 60 } } }),
    ).toBe(24);
    expect(extractFrameRate({ video: { frameRate: { max: 60 } } })).toBe(60);
  });
});

describe("extractRequestedSize", () => {
  it("should default to 640x480", () => {
    expect(extractRequestedSize({ video: true })).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("should read plain numbers", () => {
    expect(
      extractRequestedSize({ video: { width: 1280, height: 720 } }),
    ).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it("should prefer ideal over exact and max for dimensions", () => {
    expect(
      extractRequestedSize({
        video: {
          width: { ideal: 1280, exact: 640, max: 1920 },
          height: { ideal: 720, exact: 480, max: 1080 },
        },
      }),
    ).toEqual({ width: 1280, height: 720 });
  });

  it("should fall back through exact then max", () => {
    expect(
      extractRequestedSize({
        video: { width: { exact: 800 }, height: { max: 600 } },
      }),
    ).toEqual({ width: 800, height: 600 });
  });
});

describe("extractFacingMode", () => {
  it("should return null when absent", () => {
    expect(extractFacingMode({ video: true })).toBeNull();
    expect(extractFacingMode({ video: {} })).toBeNull();
  });

  it("should read a plain string", () => {
    expect(extractFacingMode({ video: { facingMode: "environment" } })).toBe(
      "environment",
    );
  });

  it("should prefer ideal over exact", () => {
    expect(
      extractFacingMode({
        video: { facingMode: { ideal: "user", exact: "environment" } },
      }),
    ).toBe("user");
  });

  it("should take the first entry of an array", () => {
    expect(
      extractFacingMode({
        video: { facingMode: { exact: ["environment", "user"] } },
      }),
    ).toBe("environment");
  });
});

describe("extractDeviceId", () => {
  it("should return null when absent", () => {
    expect(extractDeviceId({ video: true })).toBeNull();
    expect(extractDeviceId({ video: {} })).toBeNull();
  });

  it("should read a plain string", () => {
    expect(extractDeviceId({ video: { deviceId: "cam-1" } })).toBe("cam-1");
  });

  it("should prefer exact over ideal", () => {
    expect(
      extractDeviceId({
        video: { deviceId: { exact: "cam-exact", ideal: "cam-ideal" } },
      }),
    ).toBe("cam-exact");
  });

  it("should take the first entry of an array", () => {
    expect(
      extractDeviceId({ video: { deviceId: { ideal: ["cam-a", "cam-b"] } } }),
    ).toBe("cam-a");
  });
});
