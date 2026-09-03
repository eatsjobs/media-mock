import { afterEach, describe, expect, it } from "vitest";
import {
  createMediaMock,
  devices,
  type EnhancedMediaTrackCapabilities,
} from "../lib/main";

/** `torch` and `zoom` are real camera constraints the DOM lib does not type. */
type CameraConstraints = MediaTrackConstraints & {
  torch?: boolean;
  advanced?: Array<{ torch?: boolean; zoom?: number }>;
};
type CameraSettings = MediaTrackSettings & { torch?: boolean; zoom?: number };

/**
 * A camera that advertises `torch: true` accepts a torch constraint. Reporting
 * the emulated device's capabilities while the real canvas track underneath
 * refuses them is a combination no device exhibits.
 */
describe("applyConstraints on a mocked track", () => {
  const mock = createMediaMock();

  afterEach(() => {
    mock.unmock();
  });

  async function backCamera() {
    mock.mock(devices["iPhone 12"]);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    return stream.getVideoTracks()[0];
  }

  it("should accept a capability the device advertises", async () => {
    const track = await backCamera();
    expect(
      (track.getCapabilities() as EnhancedMediaTrackCapabilities).torch,
    ).toBe(true);

    await expect(
      track.applyConstraints({
        advanced: [{ torch: true }],
      } as CameraConstraints),
    ).resolves.toBeUndefined();
  });

  it("should report an applied capability in its settings", async () => {
    const track = await backCamera();

    await track.applyConstraints({
      advanced: [{ torch: true }],
    } as CameraConstraints);

    expect((track.getSettings() as CameraSettings).torch).toBe(true);
  });

  it("should accept a capability given outside advanced", async () => {
    const track = await backCamera();

    await track.applyConstraints({ torch: true } as CameraConstraints);

    expect((track.getSettings() as CameraSettings).torch).toBe(true);
  });

  it("should turn an applied capability back off", async () => {
    const track = await backCamera();
    await track.applyConstraints({
      advanced: [{ torch: true }],
    } as CameraConstraints);

    await track.applyConstraints({
      advanced: [{ torch: false }],
    } as CameraConstraints);

    expect((track.getSettings() as CameraSettings).torch).toBe(false);
  });

  it("should accept a zoom the device advertises", async () => {
    const track = await backCamera();
    expect(
      (track.getCapabilities() as EnhancedMediaTrackCapabilities).zoom,
    ).toEqual({ max: 4, min: 1 });

    await track.applyConstraints({
      advanced: [{ zoom: 2 }],
    } as CameraConstraints);

    expect((track.getSettings() as CameraSettings).zoom).toBe(2);
  });

  it("should still honour a plain size constraint", async () => {
    // Anything the device does not advertise stays the browser's business.
    const track = await backCamera();

    await expect(
      track.applyConstraints({ width: 320 }),
    ).resolves.toBeUndefined();
  });
});
