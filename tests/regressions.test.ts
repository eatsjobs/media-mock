import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createMediaDeviceInfo,
  devices,
  type EnhancedMediaTrackCapabilities,
  MediaMock,
  type MockMediaDeviceInfo,
  TimerMode,
} from "../lib/main";

describe("MediaMock regressions", () => {
  const imageUrl = "/assets/ean8_12345670.png";

  beforeEach(() => {
    MediaMock.unmock();
  });

  afterAll(() => {
    MediaMock.unmock();
  });

  it("should restore the native mediaDevices methods after calling mock() twice without unmock()", () => {
    const nativeGetUserMedia = MediaDevices.prototype.getUserMedia;
    const nativeEnumerateDevices = MediaDevices.prototype.enumerateDevices;

    MediaMock.mock(devices["iPhone 12"]);
    MediaMock.mock(devices["Samsung Galaxy M53"]);
    MediaMock.unmock();

    expect(MediaDevices.prototype.getUserMedia).toBe(nativeGetUserMedia);
    expect(MediaDevices.prototype.enumerateDevices).toBe(
      nativeEnumerateDevices,
    );
  });

  it("should report the supportedConstraints of the currently mocked device", () => {
    MediaMock.mock(devices["Mac Desktop"]);

    const constraints = navigator.mediaDevices.getSupportedConstraints();

    expect(constraints).toStrictEqual(
      devices["Mac Desktop"].supportedConstraints,
    );
  });

  it("should present the patched methods with the native signature", () => {
    // Code that sniffs navigator.mediaDevices — feature detection, wrappers
    // that forward arguments by arity — reads these.
    const nativeName = MediaDevices.prototype.getUserMedia.name;
    const nativeLength = MediaDevices.prototype.getUserMedia.length;

    MediaMock.mock(devices["iPhone 12"]);

    expect(MediaDevices.prototype.getUserMedia.name).toBe(nativeName);
    expect(MediaDevices.prototype.getUserMedia.length).toBe(nativeLength);
  });

  it("should hand out a fresh supportedConstraints object on every call", () => {
    // Real browsers build a new dictionary per call. Returning the live
    // internal one lets a caller who edits the result corrupt the mock.
    MediaMock.mock(devices["Mac Desktop"]);

    const constraints = navigator.mediaDevices.getSupportedConstraints();
    constraints.width = false;

    expect(navigator.mediaDevices.getSupportedConstraints().width).toBe(true);
    expect(MediaMock.settings.constraints.width).toBe(true);
  });

  it("should not let a caller mutate the capabilities of an enumerated device", async () => {
    // The device presets are module-level singletons shared by every consumer,
    // so getCapabilities() must not hand out the live object.
    MediaMock.mock(devices["iPhone 12"]);
    const [frontCamera] =
      (await navigator.mediaDevices.enumerateDevices()) as unknown as MockMediaDeviceInfo[];

    (frontCamera.getCapabilities().zoom as { max: number }).max = 99;

    expect(frontCamera.getCapabilities().zoom).toEqual({ max: 4, min: 1 });
    expect(
      devices["iPhone 12"].mediaDeviceInfo[0].getCapabilities().zoom,
    ).toEqual({ max: 4, min: 1 });
  });

  it("should report the emulated camera's capabilities on a real capture track", async () => {
    // A canvas-capture track carries its own getCapabilities() in both Chromium
    // and WebKit, describing the canvas rather than the camera being emulated.
    MediaMock.mock(devices["iPhone 12"]);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    const track = stream.getVideoTracks()[0];

    const capabilities =
      track.getCapabilities() as EnhancedMediaTrackCapabilities;

    // The last environment-facing entry of the iPhone 12 preset: "Back Camera".
    expect(capabilities.facingMode).toEqual(["environment"]);
    expect(capabilities.torch).toBe(true);
    expect(capabilities.zoom).toEqual({ max: 4, min: 1 });
    expect(capabilities.deviceId).toBe(
      "C92FE814FCB4F2F856CDCBFD1C555429774DD0E2",
    );
  });

  it("should make the source image visible in debug mode and hide it again when disabled", async () => {
    MediaMock.mock(devices["Samsung Galaxy M53"]);
    await MediaMock.setSource(imageUrl);
    await navigator.mediaDevices.getUserMedia({ video: true });

    MediaMock.enableDebugMode();
    const image = document.querySelector("img") as HTMLImageElement | null;
    expect(image).toBeTruthy();
    expect(image?.style.opacity).not.toBe("0");
    expect(image?.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);

    MediaMock.disableDebugMode();
    // The image stays in the DOM (webkit keeps its decoded pixel data alive
    // only while attached) but must be hidden again.
    const imageAfter = document.querySelector("img") as HTMLImageElement | null;
    expect(imageAfter).toBeTruthy();
    expect(imageAfter?.style.opacity).toBe("0");
  });

  it("should stream a video URL that carries a query string", async () => {
    // Query-string handling itself is covered in tests/unit/mediaType.test.ts;
    // this checks the URL survives the whole load-and-capture path, which is
    // where treating a video as an image used to fail.
    MediaMock.mock(devices["Samsung Galaxy M53"]);

    await MediaMock.setSource("/assets/hd_1280_720_25fps.webm?token=abc");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    expect(stream.getVideoTracks()[0].readyState).toBe("live");
    // Had the URL been classified as an image, decoding a .webm as an image
    // would have rejected setSource — and an <img> would have been attached
    // to the document. Video sources stay detached.
    expect(document.querySelector("img")).toBeNull();
  });

  it("should produce a live stream with each timer mode", async () => {
    // setTimerMode is public API and had no end-to-end coverage; Raf in
    // particular takes a different code path through the drawing loop.
    for (const mode of [TimerMode.SetInterval, TimerMode.Raf, TimerMode.Auto]) {
      MediaMock.unmock();
      MediaMock.setTimerMode(mode).mock(devices["Samsung Galaxy M53"]);
      await MediaMock.setSource(imageUrl);

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      expect(stream.getVideoTracks()[0].readyState, mode).toBe("live");
    }

    MediaMock.setTimerMode(TimerMode.SetInterval);
  });

  it("should reject when a video source fails to load", async () => {
    MediaMock.mock(devices["Samsung Galaxy M53"]);
    await MediaMock.setSource(imageUrl);

    await expect(
      MediaMock.setSource("/assets/does-not-exist.webm"),
    ).rejects.toThrow(/Video failed to load/);

    // The previous source must survive a failed swap, so an active stream keeps
    // producing frames.
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks()[0].readyState).toBe("live");
    expect(MediaMock.settings.mediaURL).toBe(imageUrl);
  });

  it("should not mutate the exported device presets when adding or removing mock devices", () => {
    const preset = devices["Samsung Galaxy M53"];
    const originalCount = preset.mediaDeviceInfo.length;
    const firstDeviceId = preset.mediaDeviceInfo[0].deviceId;

    MediaMock.mock(preset);
    MediaMock.addMockDevice(
      createMediaDeviceInfo({
        deviceId: "extra-cam",
        groupId: "extra-group",
        kind: "videoinput",
        label: "Extra Camera",
      }),
    );
    MediaMock.removeMockDevice(firstDeviceId);

    expect(preset.mediaDeviceInfo.length).toBe(originalCount);
    expect(preset.mediaDeviceInfo[0].deviceId).toBe(firstDeviceId);
  });

  it("should honor frameRate exact constraint", async () => {
    MediaMock.mock(devices["Samsung Galaxy M53"]);
    await MediaMock.setSource(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { frameRate: { exact: 25 } },
    });

    expect(stream.getVideoTracks()[0].getSettings().frameRate).toBe(25);
  });

  it("should reset the custom video tracks handler on unmock", async () => {
    let handlerCalls = 0;
    MediaMock.setMockedVideoTracksHandler((tracks) => {
      handlerCalls++;
      return tracks;
    });
    MediaMock.unmock();

    MediaMock.mock(devices["Samsung Galaxy M53"]);
    await MediaMock.setSource(imageUrl);
    await navigator.mediaDevices.getUserMedia({ video: true });

    expect(handlerCalls).toBe(0);
  });
});
