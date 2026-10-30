import { describe, expect, it } from "vitest";
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

    const advanced = [{ focusMode: "manual", focusDistance: 0.3 }];
    await track.applyConstraints({ advanced } as MediaTrackConstraints);

    expect(track.getSettings()).toMatchObject({
      focusMode: "manual",
      focusDistance: 0.3,
    });
    expect(track.getConstraints()).toEqual({ advanced });
  });
});
