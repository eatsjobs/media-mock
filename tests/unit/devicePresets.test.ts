import { describe, expect, it } from "vitest";
import type { EnhancedMediaTrackCapabilities } from "../../lib/createMediaDeviceInfo";
import { devices } from "../../lib/devices";
import { decorateVideoTrack } from "../../lib/track";

const mobileBackCameras = [
  ...devices["iPhone 12"].mediaDeviceInfo.filter(
    (d) => d.kind === "videoinput" && d.getCapabilities().torch,
  ),
  ...devices["Samsung Galaxy M53"].mediaDeviceInfo.filter(
    (d) => d.kind === "videoinput" && d.getCapabilities().torch,
  ),
];

describe("mobile back camera presets", () => {
  it("should cover the iPhone and Samsung back cameras", () => {
    expect(mobileBackCameras.map((d) => d.label)).toEqual([
      "Back Dual Wide Camera",
      "Back Ultra Wide Camera",
      "Back Camera",
      "camera2 0, facing back",
    ]);
  });

  it.each(
    mobileBackCameras.map((d) => [d.label, d] as const),
  )("%s should declare focus and exposure capabilities", (_label, device) => {
    const capabilities = device.getCapabilities();

    expect(capabilities.focusMode).toEqual([
      "manual",
      "single-shot",
      "continuous",
    ]);
    expect(capabilities.exposureMode).toEqual([
      "manual",
      "single-shot",
      "continuous",
    ]);
    for (const key of ["exposureTime", "exposureCompensation"] as const) {
      expect(capabilities[key]).toEqual({
        min: expect.any(Number),
        max: expect.any(Number),
        step: expect.any(Number),
      });
    }
  });

  it("should give the Samsung Galaxy M53 back camera a zoom range", () => {
    const back = devices["Samsung Galaxy M53"].mediaDeviceInfo.find(
      (d) => d.label === "camera2 0, facing back",
    );

    expect(back?.getCapabilities().zoom).toEqual({
      min: expect.any(Number),
      max: expect.any(Number),
    });
  });

  it("should reflect a manual focus request in the track's settings", async () => {
    const track = iPhoneBackCameraTrack();

    const advanced = [{ focusMode: "manual", focusDistance: 0.3 }];
    await track.applyConstraints({ advanced } as MediaTrackConstraints);

    expect(track.getSettings()).toMatchObject({
      focusMode: "manual",
      focusDistance: 0.3,
    });
    expect(track.getConstraints()).toEqual({ advanced });
  });

  it("should ignore advanced focus and exposure values the camera cannot meet", async () => {
    const track = iPhoneBackCameraTrack();

    const advanced = [{ focusMode: "bogus", exposureTime: 99999 }];
    await track.applyConstraints({ advanced } as MediaTrackConstraints);

    const settings = track.getSettings() as Record<string, unknown>;
    expect(settings.focusMode).toBeUndefined();
    expect(settings.exposureTime).toBeUndefined();
  });

  it.each([
    ["focusMode", "bogus"],
    ["exposureMode", "bogus"],
    ["exposureTime", 99999],
    ["exposureCompensation", -99],
  ])("should refuse an exact %s of %s", async (name, value) => {
    const track = iPhoneBackCameraTrack();

    await expect(
      track.applyConstraints({
        [name]: { exact: value },
      } as MediaTrackConstraints),
    ).rejects.toMatchObject({
      name: "OverconstrainedError",
      constraint: name,
    });
  });

  it("should settle a bare exposureTime out of range on the closest one", async () => {
    const track = iPhoneBackCameraTrack();
    const { max } = (track.getCapabilities() as EnhancedMediaTrackCapabilities)
      .exposureTime as { max: number };

    await track.applyConstraints({
      exposureTime: 99999,
    } as MediaTrackConstraints);

    expect(
      (track.getSettings() as { exposureTime?: number }).exposureTime,
    ).toBe(max);
  });
});

/** A track decorated as the iPhone 12 "Back Camera", with no browser behind it. */
function iPhoneBackCameraTrack(): MediaStreamTrack {
  const back = devices["iPhone 12"].mediaDeviceInfo.find(
    (d) => d.label === "Back Camera",
  );
  const track = {
    getSettings: () => ({}),
  } as unknown as MediaStreamTrack;
  decorateVideoTrack(track, {
    device: back,
    fps: 30,
    resolution: { width: 1280, height: 720 },
    deviceResolutions: [],
  });
  return track;
}
