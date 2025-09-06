import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMediaDeviceInfo, devices, MediaMock } from "../lib/main";

describe("MediaMock", () => {
  const imageUrl = "/assets/ean8_12345670.png";

  beforeEach(() => {
    MediaMock.unmock(); // Cleanup after each test
  });

  it("should set the image URL correctly", () => {
    MediaMock.setMediaURL(imageUrl);
    expect(MediaMock["settings"].mediaURL).toBe(imageUrl); // Access private property for testing
  });

  it("should mock iPhone 12 correctly", async () => {
    MediaMock.setMediaURL(imageUrl).mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });

    expect(stream).toBeDefined();
    expect(stream.getTracks().length).toBeGreaterThan(0); // Check if there are tracks
  });

  it("should mock getSupportedConstraints", async () => {
    MediaMock.setMediaURL(imageUrl).mock(devices["iPhone 12"]);

    const constraints = await navigator.mediaDevices.getSupportedConstraints();

    expect(constraints).toBeDefined();
    expect(constraints).toStrictEqual(
      devices["iPhone 12"].supportedConstraints,
    );
  });

  it("should trigger devicechange event when devices are changed", async () => {
    const deviceChangeSpy = vi.fn();

    // Listen to the devicechange event
    navigator.mediaDevices.addEventListener("devicechange", deviceChangeSpy);

    // Initialize the mock with a specific device
    MediaMock.setMediaURL(imageUrl).mock(devices["iPhone 12"]);

    const newMediaDevice = createMediaDeviceInfo({
      deviceId: "5",
      groupId: "3d",
      kind: "videoinput",
      label: "New USB Camera",
      mockCapabilities: {
        width: { min: 640, max: 1920 },
        height: { min: 480, max: 1080 },
      },
    });
    MediaMock.addMockDevice(newMediaDevice);

    expect(deviceChangeSpy).toHaveBeenCalled();
    const enumeratedDevices = await navigator.mediaDevices.enumerateDevices();
    expect(enumeratedDevices).toContain(newMediaDevice);

    MediaMock.removeMockDevice(newMediaDevice.deviceId);
    expect(deviceChangeSpy).toHaveBeenCalledTimes(2);

    const enumeratedDevices2 = await navigator.mediaDevices.enumerateDevices();
    expect(enumeratedDevices2).not.toContain(newMediaDevice);
  });

  it("should return correct video resolutions", () => {
    MediaMock.setMediaURL(imageUrl).mock(devices["iPhone 12"]);

    const resolution = MediaMock["getResolution"](
      {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      },
      devices["iPhone 12"],
    );

    expect(resolution).toEqual({ width: 1080, height: 1920 });
  });

  it("should unmock properly", () => {
    MediaMock.setMediaURL(imageUrl).mock(devices["iPhone 12"]);

    MediaMock.unmock();

    expect(MediaMock["mapUnmockFunction"].size).toBe(0);
  });

  it("should apply frameRate constraint", async () => {
    MediaMock.setMediaURL(imageUrl).mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { frameRate: 15 },
    });
    expect(stream.getVideoTracks()[0].getSettings().frameRate).toBe(15);
  });

  it("should apply resolution constraints", async () => {
    MediaMock.setMediaURL(imageUrl).mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1920, height: 1080 },
    });
    const settings = stream.getVideoTracks()[0].getSettings();
    // check if the device is in portrait mode
    expect(window.innerHeight > window.innerWidth).toBe(true);
    expect(settings.width).toBe(1080);
    expect(settings.height).toBe(1920);
  });

  it("should append debug elements to the DOM", async () => {
    MediaMock.enableDebugMode()
      .setMediaURL(imageUrl)
      .mock(devices["iPhone 12"]);

    await navigator.mediaDevices.getUserMedia({ video: true });

    expect.soft(document.querySelector("canvas")).toBeTruthy();
    expect.soft(document.querySelector("img")).toBeTruthy();
    MediaMock.disableDebugMode();
  });

  it("should not append debug elements when debug mode is disabled", async () => {
    MediaMock.setMediaURL(imageUrl).mock(devices["iPhone 12"]);

    await navigator.mediaDevices.getUserMedia({ video: true });

    expect.soft(document.querySelector("canvas")).toBeFalsy();
    expect.soft(document.querySelector("img")).toBeFalsy();
  });

  it("should create mediaDevice correctly", async () => {
    const device = createMediaDeviceInfo({
      deviceId: "5",
      groupId: "3d",
      kind: "videoinput",
      label: "New USB Camera",
      mockCapabilities: {
        width: { min: 640, max: 1920 },
        height: { min: 480, max: 1080 },
      },
    });

    expect(device.getCapabilities()).toEqual({
      width: { min: 640, max: 1920 },
      height: { min: 480, max: 1080 },
    });

    expect(device.toJSON()).toEqual(
      expect.objectContaining({
        deviceId: "5",
        groupId: "3d",
        kind: "videoinput",
        label: "New USB Camera",
      }),
    );
  });

  it("should mock video tracks aspect ratio", async () => {
    MediaMock.setMediaURL(imageUrl)
      .setMockedVideoTracksHandler((tracks) => {
        const settings = tracks[0].getSettings();
        tracks[0].getSettings = () => ({
          ...settings,
          aspectRatio: 2,
        });
        return tracks;
      })
      .mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks()[0].getSettings().aspectRatio).toBe(2);
  });

  it("should allow changing media URL after stream is created", async () => {
    const initialImageUrl = "/assets/ean8_12345670.png";
    const newMediaUrl = "/assets/hd_1280_720_25fps.mp4";

    // Setup mock with initial image
    MediaMock.setMediaURL(initialImageUrl).mock(devices["iPhone 12"]);

    // Request a stream
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream).toBeDefined();
    expect(MediaMock["settings"].mediaURL).toBe(initialImageUrl);

    // Change the media URL while stream is active
    MediaMock.setMediaURL(newMediaUrl);

    // Verify the URL was changed in settings
    expect(MediaMock["settings"].mediaURL).toBe(newMediaUrl);

    // Give time for the interval to update with new image
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Stream should still be active
    expect(stream.active).toBe(true);
    expect(stream.getVideoTracks()[0].readyState).toBe("live");
  });

  it("should apply canvas scale factor correctly", () => {
    const scaleFactor = 0.8;

    MediaMock.setCanvasScaleFactor(scaleFactor);
    expect(MediaMock["settings"].canvasScaleFactor).toBe(scaleFactor);

    MediaMock.setCanvasScaleFactor(1.5);
    expect(MediaMock["settings"].canvasScaleFactor).toBe(1.5);

    MediaMock.setCanvasScaleFactor(0.05);
    expect(MediaMock["settings"].canvasScaleFactor).toBe(0.1);
  });

  it("should mock video tracks capabilities", async () => {
    MediaMock.setMediaURL(imageUrl)
      .setMockedVideoTracksHandler((tracks) => {
        const capabilities = tracks[0].getCapabilities();
        tracks[0].getCapabilities = () => ({
          ...capabilities,
          whatever: 1,
        });
        return tracks;
      })
      .mock(devices["iPhone 12"]);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks()[0].getCapabilities()).toEqual(
      expect.objectContaining({
        whatever: 1,
      }),
    );
  });
});
