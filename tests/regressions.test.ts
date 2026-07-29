import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMediaDeviceInfo, devices, MediaMock } from "../lib/main";

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

  it("should make the source image visible in debug mode and hide it again when disabled", async () => {
    MediaMock.mock(devices["Samsung Galaxy M53"]);
    await MediaMock.setMediaURL(imageUrl);
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

    await MediaMock.setMediaURL("/assets/hd_1280_720_25fps.webm?token=abc");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

    expect(stream.getVideoTracks()[0].readyState).toBe("live");
    // Had the URL been classified as an image, decoding a .webm as an image
    // would have rejected setMediaURL — and an <img> would have been attached
    // to the document. Video sources stay detached.
    expect(document.querySelector("img")).toBeNull();
  });

  it("should reject when a video source fails to load", async () => {
    MediaMock.mock(devices["Samsung Galaxy M53"]);
    await MediaMock.setMediaURL(imageUrl);

    await expect(
      MediaMock.setMediaURL("/assets/does-not-exist.webm"),
    ).rejects.toThrow(/Video failed to load/);

    // The previous source must survive a failed swap, so an active stream keeps
    // producing frames.
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks()[0].readyState).toBe("live");
    expect(MediaMock["settings"].mediaURL).toBe(imageUrl);
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
    await MediaMock.setMediaURL(imageUrl);

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
    await MediaMock.setMediaURL(imageUrl);
    await navigator.mediaDevices.getUserMedia({ video: true });

    expect(handlerCalls).toBe(0);
  });
});
