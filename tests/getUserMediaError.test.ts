import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { devices, MediaMock } from "../lib/main";

describe("getUserMedia error simulation", () => {
  const imageUrl = "/assets/ean8_12345670.png";

  beforeEach(() => {
    MediaMock.unmock();
  });

  afterAll(() => {
    MediaMock.unmock();
  });

  it("should reject getUserMedia with a DOMException carrying the simulated error name", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    await MediaMock.setSource(imageUrl);

    MediaMock.simulateGetUserMediaError("NotAllowedError");

    await expect(
      navigator.mediaDevices.getUserMedia({ video: true }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof DOMException &&
        error.name === "NotAllowedError" &&
        error.message === "Permission denied",
    );
  });

  it("should use a custom message when one is provided", async () => {
    MediaMock.mock(devices["iPhone 12"]);

    MediaMock.simulateGetUserMediaError("NotReadableError", {
      message: "Camera is already in use by another app",
    });

    await expect(
      navigator.mediaDevices.getUserMedia({ video: true }),
    ).rejects.toThrowError("Camera is already in use by another app");
  });

  it("should expose the offending constraint on OverconstrainedError", async () => {
    MediaMock.mock(devices["iPhone 12"]);

    MediaMock.simulateGetUserMediaError("OverconstrainedError", {
      constraint: "width",
    });

    await expect(
      navigator.mediaDevices.getUserMedia({
        video: { width: { exact: 99999 } },
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        (error as DOMException).name === "OverconstrainedError" &&
        (error as { constraint?: string }).constraint === "width",
    );
  });

  it("should reject with a fresh error instance on every call", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    MediaMock.simulateGetUserMediaError("NotFoundError");

    const first = await navigator.mediaDevices
      .getUserMedia({ video: true })
      .catch((error: unknown) => error);
    const second = await navigator.mediaDevices
      .getUserMedia({ video: true })
      .catch((error: unknown) => error);

    expect(first).not.toBe(second);
    expect((second as DOMException).name).toBe("NotFoundError");
  });

  it("should stream normally again after clearGetUserMediaError", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    await MediaMock.setSource(imageUrl);
    MediaMock.simulateGetUserMediaError("NotAllowedError");

    MediaMock.clearGetUserMediaError();

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks().length).toBeGreaterThan(0);
  });

  it("should redact enumerateDevices entries while permission is denied", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    MediaMock.simulateGetUserMediaError("NotAllowedError");

    const enumerated = await navigator.mediaDevices.enumerateDevices();

    expect(enumerated.length).toBe(devices["iPhone 12"].mediaDeviceInfo.length);
    for (const device of enumerated) {
      expect(device.label).toBe("");
      expect(device.deviceId).toBe("");
      expect(device.groupId).toBe("");
      expect(device.kind).toBe("videoinput");
    }
  });

  it("should not redact enumerateDevices for non-permission errors", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    MediaMock.simulateGetUserMediaError("NotReadableError");

    const enumerated = await navigator.mediaDevices.enumerateDevices();

    expect(enumerated[0].label).toBe(
      devices["iPhone 12"].mediaDeviceInfo[0].label,
    );
  });

  it("should restore full device info after clearing the simulated error", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    MediaMock.simulateGetUserMediaError("NotAllowedError");
    await navigator.mediaDevices.enumerateDevices();

    MediaMock.clearGetUserMediaError();
    const enumerated = await navigator.mediaDevices.enumerateDevices();

    expect(enumerated[0].label).toBe(
      devices["iPhone 12"].mediaDeviceInfo[0].label,
    );
    expect(enumerated[0].deviceId).toBe(
      devices["iPhone 12"].mediaDeviceInfo[0].deviceId,
    );
    // Redaction must not have mutated the configured devices or the preset.
    expect(devices["iPhone 12"].mediaDeviceInfo[0].label).not.toBe("");
  });

  it("should clear a simulated error on unmock", async () => {
    MediaMock.mock(devices["iPhone 12"]);
    MediaMock.simulateGetUserMediaError("NotAllowedError");

    MediaMock.unmock();
    MediaMock.mock(devices["iPhone 12"]);
    await MediaMock.setSource(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks().length).toBeGreaterThan(0);
  });

  it("should support chaining the error simulation methods", () => {
    expect(
      MediaMock.mock(devices["iPhone 12"])
        .simulateGetUserMediaError("AbortError")
        .clearGetUserMediaError(),
    ).toBe(MediaMock);
  });
});
