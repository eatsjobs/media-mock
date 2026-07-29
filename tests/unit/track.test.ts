import { describe, expect, it } from "vitest";
import { createMediaDeviceInfo } from "../../lib/createMediaDeviceInfo";
import { decorateVideoTrack } from "../../lib/track";

const backCamera = createMediaDeviceInfo({
  deviceId: "back-1",
  groupId: "group-back",
  kind: "videoinput",
  label: "Back Camera",
  mockCapabilities: {
    facingMode: ["environment"],
    width: { min: 1, max: 4032 },
    torch: true,
  },
});

/**
 * A stand-in for a canvas-capture track: enough surface for decoration, without
 * needing a browser. `getSettings` returns bare settings, as a real capture track
 * does — that is precisely what decoration fills in.
 */
function stubTrack(
  settings: MediaTrackSettings = {},
  extras: Partial<MediaStreamTrack> = {},
) {
  return {
    getSettings: () => ({ ...settings }),
    ...extras,
  } as unknown as MediaStreamTrack;
}

const decoration = {
  device: backCamera,
  fps: 25,
  resolution: { width: 1280, height: 720 },
  deviceResolutions: [
    { width: 1920, height: 1080 },
    { width: 640, height: 480 },
  ],
};

describe("decorateVideoTrack", () => {
  it("should adopt the device's label and id", () => {
    const track = stubTrack();
    decorateVideoTrack(track, decoration);

    expect(track.label).toBe("Back Camera");
    expect(track.id).toBe("back-1");
  });

  it("should leave label and id alone when no device was selected", () => {
    const track = stubTrack();
    decorateVideoTrack(track, { ...decoration, device: undefined });

    expect(track.label).toBeUndefined();
    expect(track.id).toBeUndefined();
  });

  it("should fill in frameRate and frame size that a capture track omits", () => {
    const track = stubTrack();
    decorateVideoTrack(track, decoration);

    const settings = track.getSettings();
    expect(settings.frameRate).toBe(25);
    expect(settings.width).toBe(1280);
    expect(settings.height).toBe(720);
  });

  it("should not overwrite a frameRate the track already reports", () => {
    const track = stubTrack({ frameRate: 60 });
    decorateVideoTrack(track, decoration);

    expect(track.getSettings().frameRate).toBe(60);
  });

  it("should report the device id rather than the synthetic track id", () => {
    // Some browsers put the canvas stream's random uuid in settings.deviceId,
    // which tells a consumer nothing about which camera this is.
    const track = stubTrack({ deviceId: "random-uuid" });
    decorateVideoTrack(track, decoration);

    expect(track.getSettings().deviceId).toBe("back-1");
  });

  it("should expose the device's facingMode", () => {
    const track = stubTrack();
    decorateVideoTrack(track, decoration);

    expect(track.getSettings().facingMode).toBe("environment");
  });

  it("should keep a facingMode the track already reports", () => {
    const track = stubTrack({ facingMode: "user" });
    decorateVideoTrack(track, decoration);

    expect(track.getSettings().facingMode).toBe("user");
  });

  it("should use the device's capabilities when the track has none", () => {
    const track = stubTrack();
    decorateVideoTrack(track, decoration);

    expect(track.getCapabilities()).toEqual(backCamera.getCapabilities());
  });

  it("should derive capabilities from the device resolutions with no device", () => {
    const track = stubTrack();
    decorateVideoTrack(track, { ...decoration, device: undefined });

    expect(track.getCapabilities()).toEqual({
      width: { min: 640, max: 1920 },
      height: { min: 480, max: 1080 },
      frameRate: { min: 1, max: 60 },
      facingMode: ["user", "environment"],
      resizeMode: ["none", "crop-and-scale"],
    });
  });

  it("should keep a getCapabilities the track already provides", () => {
    const own = () => ({ width: { min: 2, max: 3 } });
    const track = stubTrack({}, { getCapabilities: own });
    decorateVideoTrack(track, decoration);

    expect(track.getCapabilities()).toEqual({ width: { min: 2, max: 3 } });
  });
});
