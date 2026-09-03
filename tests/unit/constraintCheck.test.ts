import { describe, expect, it } from "vitest";
import { findUnsatisfiableConstraint } from "../../lib/constraintCheck";
import { createMediaDeviceInfo } from "../../lib/createMediaDeviceInfo";
import type { SupportedConstraints } from "../../lib/devices";

const backCamera = createMediaDeviceInfo({
  deviceId: "back-1",
  groupId: "group-back",
  kind: "videoinput",
  label: "Back Camera",
  mockCapabilities: {
    facingMode: ["environment"],
    frameRate: { min: 1, max: 60 },
    height: { min: 1, max: 3024 },
    width: { min: 1, max: 4032 },
  },
});

const microphone = createMediaDeviceInfo({
  deviceId: "mic-1",
  groupId: "group-mic",
  kind: "audioinput",
  label: "Microphone",
  mockCapabilities: {
    channelCount: { min: 1, max: 2 },
    sampleRate: { min: 44100, max: 48000 },
  },
});

const check = (
  constraints: MediaStreamConstraints,
  supportedConstraints: SupportedConstraints = {},
) =>
  findUnsatisfiableConstraint({
    constraints,
    videoDevice: backCamera,
    audioDevice: microphone,
    supportedConstraints,
  });

describe("findUnsatisfiableConstraint", () => {
  it("should accept a request the device can serve", () => {
    expect(
      check({ video: { width: { exact: 1280 }, height: { exact: 720 } } }),
    ).toBeNull();
  });

  it("should name width when an exact width exceeds the device's range", () => {
    expect(check({ video: { width: { exact: 99999 } } })).toBe("width");
  });

  it("should name height when an exact height exceeds the device's range", () => {
    expect(check({ video: { height: { exact: 99999 } } })).toBe("height");
  });

  it("should name width when a minimum is above what the device can reach", () => {
    expect(check({ video: { width: { min: 8000 } } })).toBe("width");
  });

  it("should name width when a maximum is below what the device can reach", () => {
    expect(check({ video: { width: { max: 0 } } })).toBe("width");
  });

  it("should name frameRate when an exact rate exceeds the device's range", () => {
    expect(check({ video: { frameRate: { exact: 240 } } })).toBe("frameRate");
  });

  it("should ignore an ideal value the device cannot reach", () => {
    // `ideal` is advisory: browsers get as close as they can and never reject.
    expect(check({ video: { width: { ideal: 99999 } } })).toBeNull();
  });

  it("should ignore a bare value the device cannot reach", () => {
    // A bare value is treated as `ideal` by getUserMedia.
    expect(check({ video: { width: 99999 } })).toBeNull();
  });

  it("should name deviceId when an exact camera id was not the one selected", () => {
    expect(check({ video: { deviceId: { exact: "nope" } } })).toBe("deviceId");
  });

  it("should accept an exact camera id that was selected", () => {
    expect(check({ video: { deviceId: { exact: "back-1" } } })).toBeNull();
  });

  it("should name facingMode when the camera does not face that way", () => {
    expect(check({ video: { facingMode: { exact: "user" } } })).toBe(
      "facingMode",
    );
  });

  it("should accept a facingMode the camera supports", () => {
    expect(
      check({ video: { facingMode: { exact: "environment" } } }),
    ).toBeNull();
  });

  it("should name deviceId when an exact microphone id was not the one selected", () => {
    expect(check({ audio: { deviceId: { exact: "nope" } } })).toBe("deviceId");
  });

  it("should name channelCount when the microphone cannot supply that many", () => {
    expect(check({ audio: { channelCount: { exact: 6 } } })).toBe(
      "channelCount",
    );
  });

  it("should enforce a range the device reports as a supported constraint", () => {
    expect(
      check({ audio: { sampleRate: { exact: 8000 } } }, { sampleRate: true }),
    ).toBe("sampleRate");
  });

  it("should ignore a constraint the device reports as unsupported", () => {
    // A UA ignores a constraint it does not implement, so a mock that both
    // advertises sampleRate as unsupported and rejects over it is incoherent.
    expect(
      check({ audio: { sampleRate: { exact: 8000 } } }, { sampleRate: false }),
    ).toBeNull();
  });

  it("should ignore an unsupported video constraint too", () => {
    expect(
      check({ video: { width: { exact: 99999 } } }, { width: false }),
    ).toBeNull();
  });

  it("should not check video constraints when video was not requested", () => {
    expect(check({ audio: true, video: false })).toBeNull();
  });

  it("should skip a dimension the device declares no capability for", () => {
    const bare = createMediaDeviceInfo({
      deviceId: "bare",
      groupId: "bare",
      kind: "videoinput",
      label: "Bare",
      mockCapabilities: {},
    });

    expect(
      findUnsatisfiableConstraint({
        constraints: { video: { width: { exact: 99999 } } },
        videoDevice: bare,
        audioDevice: undefined,
        supportedConstraints: {},
      }),
    ).toBeNull();
  });
});
