import { afterEach, describe, expect, it } from "vitest";
import { createMediaDeviceInfo } from "../../lib/createMediaDeviceInfo";
import { createMediaMock, devices } from "../../lib/main";

/**
 * Plain node: no `MediaDevices`, no `document`, no `window`. The mock supplies
 * its own `navigator.mediaDevices`, so everything that does not need pixels
 * works here — which is most of what a unit test asks a camera about.
 */
describe("node, with no DOM at all", () => {
  const mock = createMediaMock();
  const frameless = { frames: false, audio: false } as const;

  const extraCamera = createMediaDeviceInfo({
    deviceId: "extra-1",
    groupId: "extra",
    kind: "videoinput",
    label: "Extra Camera",
  });

  afterEach(() => {
    mock.unmock();
  });

  it("should install a working navigator.mediaDevices", () => {
    expect(navigator.mediaDevices).toBeUndefined();

    mock.mock(devices["iPhone 12"], frameless);

    expect(typeof navigator.mediaDevices.getUserMedia).toBe("function");
  });

  it("should work where the runtime has no global navigator", () => {
    // Node only grew a global `navigator` in v21; the package declares
    // engines.node >= 16, and CI runs 22 and 24, so this range is untested.
    const nativeNavigator = globalThis.navigator;
    // @ts-expect-error - simulating Node 16-20
    delete globalThis.navigator;

    try {
      mock.mock(devices["iPhone 12"], frameless);

      expect(typeof navigator.mediaDevices.getUserMedia).toBe("function");
    } finally {
      mock.unmock();
      globalThis.navigator = nativeNavigator;
    }
  });

  it("should leave no navigator behind where it invented one", () => {
    const nativeNavigator = globalThis.navigator;
    // @ts-expect-error - simulating Node 16-20
    delete globalThis.navigator;

    try {
      mock.mock(devices["iPhone 12"], frameless);
      mock.unmock();

      expect(globalThis.navigator).toBeUndefined();
    } finally {
      globalThis.navigator = nativeNavigator;
    }
  });

  it("should remove it again on unmock", () => {
    mock.mock(devices["iPhone 12"], frameless);

    mock.unmock();

    expect(navigator.mediaDevices).toBeUndefined();
  });

  it("should enumerate the emulated devices", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    const enumerated = await navigator.mediaDevices.enumerateDevices();

    expect(enumerated[0].label).toBe("Front Camera");
  });

  it("should not throw from addMockDevice", () => {
    mock.mock(devices["iPhone 12"], frameless);

    expect(() => mock.addMockDevice(extraCamera)).not.toThrow();
  });

  it("should record the device it was given", () => {
    mock.mock(devices["iPhone 12"], frameless);

    mock.addMockDevice(extraCamera);

    expect(
      mock.settings.device.mediaDeviceInfo.some(
        (device) => device.deviceId === "extra-1",
      ),
    ).toBe(true);
  });

  it("should not throw from removeMockDevice", () => {
    mock.mock(devices["iPhone 12"], frameless);

    expect(() => mock.removeMockDevice("extra-1")).not.toThrow();
  });

  it("should serve a frameless stream without a window to measure", async () => {
    // Orientation is read from `window`, which node does not have.
    mock.mock(devices["iPhone 12"], frameless);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    expect(stream.getVideoTracks()[0].label).toBe("Front Camera");
  });

  it("should refuse a request the device cannot serve", async () => {
    mock.mock(devices["iPhone 12"], frameless);

    await expect(
      navigator.mediaDevices.getUserMedia({
        video: { width: { exact: 99999 } },
      }),
    ).rejects.toMatchObject({ constraint: "width" });
  });
});
