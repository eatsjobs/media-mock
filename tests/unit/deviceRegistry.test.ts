import { describe, expect, it } from "vitest";
import { createMediaDeviceInfo } from "../../lib/createMediaDeviceInfo";
import {
  cloneDeviceConfig,
  listDevices,
  selectVideoDevice,
} from "../../lib/deviceRegistry";
import type { DeviceConfig } from "../../lib/devices";

const frontCamera = createMediaDeviceInfo({
  deviceId: "front-1",
  groupId: "group-front",
  kind: "videoinput",
  label: "Front Camera",
  mockCapabilities: { facingMode: ["user"] },
});

const backCamera = createMediaDeviceInfo({
  deviceId: "back-1",
  groupId: "group-back",
  kind: "videoinput",
  label: "Back Camera",
  mockCapabilities: { facingMode: ["environment"] },
});

const backTelephoto = createMediaDeviceInfo({
  deviceId: "back-2",
  groupId: "group-back",
  kind: "videoinput",
  label: "Back Telephoto Camera",
  mockCapabilities: { facingMode: ["environment"] },
});

const microphone = createMediaDeviceInfo({
  deviceId: "mic-1",
  groupId: "group-mic",
  kind: "audioinput",
  label: "Microphone",
});

const config = (): DeviceConfig => ({
  videoResolutions: [{ width: 1280, height: 720 }],
  mediaDeviceInfo: [frontCamera, backCamera, backTelephoto, microphone],
  supportedConstraints: { width: true, facingMode: true },
});

describe("cloneDeviceConfig", () => {
  it("should copy the config so mutations do not reach the original", () => {
    const original = config();
    const copy = cloneDeviceConfig(original);

    copy.mediaDeviceInfo.push(frontCamera);
    copy.videoResolutions[0].width = 1;
    copy.supportedConstraints.width = false;

    expect(original.mediaDeviceInfo).toHaveLength(4);
    expect(original.videoResolutions[0].width).toBe(1280);
    expect(original.supportedConstraints.width).toBe(true);
  });

  it("should preserve the device entries themselves", () => {
    const copy = cloneDeviceConfig(config());
    expect(copy.mediaDeviceInfo[0].label).toBe("Front Camera");
    expect(copy.mediaDeviceInfo[0].getCapabilities().facingMode).toEqual([
      "user",
    ]);
  });
});

describe("selectVideoDevice", () => {
  it("should return the first videoinput when nothing is requested", () => {
    expect(selectVideoDevice(config(), {})?.deviceId).toBe("front-1");
  });

  it("should honor an explicit deviceId", () => {
    expect(selectVideoDevice(config(), { deviceId: "back-2" })?.deviceId).toBe(
      "back-2",
    );
  });

  it("should prefer deviceId over facingMode", () => {
    expect(
      selectVideoDevice(config(), {
        deviceId: "front-1",
        facingMode: "environment",
      })?.deviceId,
    ).toBe("front-1");
  });

  it("should fall back to facingMode when the deviceId is unknown", () => {
    expect(
      selectVideoDevice(config(), {
        deviceId: "nope",
        facingMode: "user",
      })?.deviceId,
    ).toBe("front-1");
  });

  it("should return the LAST device matching a facingMode", () => {
    // Devices are ordered wide-to-telephoto; the last environment-facing entry
    // is the one a real device reports as the default back camera.
    expect(
      selectVideoDevice(config(), { facingMode: "environment" })?.deviceId,
    ).toBe("back-2");
  });

  it("should fall back to the first videoinput for an unsatisfiable facingMode", () => {
    expect(selectVideoDevice(config(), { facingMode: "left" })?.deviceId).toBe(
      "front-1",
    );
  });

  it("should never return a non-video device", () => {
    expect(selectVideoDevice(config(), { deviceId: "mic-1" })?.kind).not.toBe(
      "audioinput",
    );
  });

  it("should return undefined when there are no video devices", () => {
    expect(
      selectVideoDevice(
        { ...config(), mediaDeviceInfo: [microphone] },
        { facingMode: "user" },
      ),
    ).toBeUndefined();
  });
});

describe("listDevices", () => {
  it("should return the devices as configured", () => {
    const listed = listDevices(config(), { redacted: false });
    expect(listed).toHaveLength(4);
    expect(listed[0].label).toBe("Front Camera");
    expect(listed[0].deviceId).toBe("front-1");
  });

  it("should blank identifying fields when redacted, keeping kind", () => {
    const listed = listDevices(config(), { redacted: true });

    expect(listed).toHaveLength(4);
    for (const device of listed) {
      expect(device.label).toBe("");
      expect(device.deviceId).toBe("");
      expect(device.groupId).toBe("");
    }
    expect(listed.map((d) => d.kind)).toEqual([
      "videoinput",
      "videoinput",
      "videoinput",
      "audioinput",
    ]);
  });

  it("should not mutate the config when redacting", () => {
    const original = config();
    listDevices(original, { redacted: true });
    expect(original.mediaDeviceInfo[0].label).toBe("Front Camera");
  });
});
