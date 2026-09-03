import { describe, expect, it, vi } from "vitest";
import { createMediaDeviceInfo } from "../../lib/createMediaDeviceInfo";
import { createMediaMock, devices } from "../../lib/main";

/**
 * Node has no `MediaDevices`. `mock()` already tolerates that and warns, so
 * everything reachable afterwards has to tolerate it too.
 */
describe("an environment without MediaDevices", () => {
  const extraCamera = createMediaDeviceInfo({
    deviceId: "extra-1",
    groupId: "extra",
    kind: "videoinput",
    label: "Extra Camera",
  });

  it("should warn rather than throw from mock()", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mock = createMediaMock();

    expect(() => mock.mock(devices["iPhone 12"])).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("should not throw from addMockDevice", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mock = createMediaMock();
    mock.mock(devices["iPhone 12"]);

    expect(() => mock.addMockDevice(extraCamera)).not.toThrow();

    warn.mockRestore();
  });

  it("should still record the device it was given", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mock = createMediaMock();
    mock.mock(devices["iPhone 12"]);

    mock.addMockDevice(extraCamera);

    expect(
      mock.settings.device.mediaDeviceInfo.some(
        (device) => device.deviceId === "extra-1",
      ),
    ).toBe(true);

    warn.mockRestore();
  });

  it("should not throw from removeMockDevice", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mock = createMediaMock();
    mock.mock(devices["iPhone 12"]);

    expect(() => mock.removeMockDevice("extra-1")).not.toThrow();

    warn.mockRestore();
  });
});
