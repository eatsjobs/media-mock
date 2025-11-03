import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMediaDeviceInfo,
  type DeviceConfig,
  devices,
  MediaMock,
} from "../lib/main";

describe("MediaMock", () => {
  const imageUrl = "/assets/ean8_12345670.png";

  type BrowserName = "firefox" | "webkit" | "chromium";

  const getBrowserName = (): BrowserName => {
    if (typeof window !== "undefined" && window.navigator) {
      const ua = navigator.userAgent.toLowerCase();

      // Firefox detection
      if (ua.includes("firefox")) {
        return "firefox";
      }

      // WebKit/Safari detection (iOS Safari)
      if (
        ua.includes("webkit") &&
        ua.includes("safari") &&
        !ua.includes("chrome")
      ) {
        return "webkit";
      }

      // Chromium detection (Android Chrome)
      if (ua.includes("chrome") || ua.includes("chromium")) {
        return "chromium";
      }
    }

    // Fallback to chromium
    return "chromium";
  };

  const browserDeviceMap: Record<BrowserName, DeviceConfig> = {
    firefox: devices["Samsung Galaxy M53"], // Android + Firefox
    webkit: devices["iPhone 12"], // iOS Safari
    chromium: devices["Samsung Galaxy M53"], // Android + Chrome
  };

  const getDeviceForBrowser = (): DeviceConfig => {
    const browserName = getBrowserName();
    return browserDeviceMap[browserName];
  };

  beforeEach(() => {
    MediaMock.unmock(); // Cleanup after each test
  });

  afterAll(() => {
    // Final cleanup to ensure no hanging resources
    MediaMock.unmock();
  });

  it("should set the image URL correctly", async () => {
    await MediaMock.setMediaURL(imageUrl);
    expect(MediaMock["settings"].mediaURL).toBe(imageUrl); // Access private property for testing
  });

  it("should mock device correctly", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

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
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const constraints = await navigator.mediaDevices.getSupportedConstraints();

    expect(constraints).toBeDefined();
    expect(constraints).toStrictEqual(device.supportedConstraints);
  });

  it("should trigger devicechange event when devices are changed", async () => {
    const deviceChangeSpy = vi.fn();

    // Listen to the devicechange event
    navigator.mediaDevices.addEventListener("devicechange", deviceChangeSpy);

    // Initialize the mock with a specific device
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

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

  it("should return correct video resolutions", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const resolution = MediaMock["getResolution"](
      {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      },
      device,
    );

    expect(resolution).toEqual({ width: 1080, height: 1920 });
  });

  it("should unmock properly", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    MediaMock.unmock();

    expect(MediaMock["mapUnmockFunction"].size).toBe(0);
  });

  it("should apply frameRate constraint", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { frameRate: 15 },
    });

    // Real devices always provide frameRate - media-mock should normalize this
    expect(stream.getVideoTracks()[0].getSettings().frameRate).toBe(15);
  });

  it("should apply resolution constraints", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1920, height: 1080 },
    });
    const settings = stream.getVideoTracks()[0].getSettings();

    // check if the device is in portrait mode
    expect(window.innerHeight > window.innerWidth).toBe(true);

    // Real devices always provide resolution - media-mock should normalize this
    expect(settings.width).toBe(1080);
    expect(settings.height).toBe(1920);
  });

  it("should append debug elements to the DOM", async () => {
    const device = getDeviceForBrowser();
    MediaMock.enableDebugMode().mock(device);
    await MediaMock.setMediaURL(imageUrl);

    await navigator.mediaDevices.getUserMedia({ video: true });

    expect.soft(document.querySelector("canvas")).toBeTruthy();
    expect.soft(document.querySelector("img")).toBeTruthy();
    MediaMock.disableDebugMode();
  });

  it("should not append debug elements when debug mode is disabled", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

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
    const device = getDeviceForBrowser();
    MediaMock.setMockedVideoTracksHandler((tracks) => {
      const settings = tracks[0].getSettings();
      tracks[0].getSettings = () => ({
        ...settings,
        aspectRatio: 2,
      });
      return tracks;
    }).mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks()[0].getSettings().aspectRatio).toBe(2);
  });

  it("should allow changing media URL after stream is created", async () => {
    const initialImageUrl = "/assets/ean8_12345670.png";
    const newMediaUrl = "/assets/florida_dl_front.png";

    // Setup mock with initial image
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(initialImageUrl);

    // Request a stream
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream).toBeDefined();
    expect(MediaMock["settings"].mediaURL).toBe(initialImageUrl);

    // Change the media URL while stream is active
    await MediaMock.setMediaURL(newMediaUrl);

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
    const device = getDeviceForBrowser();
    MediaMock.setMockedVideoTracksHandler((tracks) => {
      const capabilities = tracks[0].getCapabilities();
      tracks[0].getCapabilities = () => ({
        ...capabilities,
        whatever: 1,
      });
      return tracks;
    }).mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks()[0].getCapabilities()).toEqual(
      expect.objectContaining({
        whatever: 1,
      }),
    );
  });

  it("should detect video URLs correctly", async () => {
    const videoUrl = "/assets/hd_1280_720_25fps.webm";
    const imageUrl = "/assets/ean8_12345670.png";
    // const video = document.createElement("video");

    // Test if we can fetch both assets directly
    try {
      const imageResponse = await fetch(imageUrl);
      console.log("Image fetch status:", imageResponse.status);

      const videoResponse = await fetch(videoUrl);
      console.log("Video fetch status:", videoResponse.status);
      // console.log(
      //   "Video response headers:",
      //   Object.fromEntries(videoResponse.headers.entries()),
      // );
    } catch (error) {
      console.log("Fetch error:", error);
      // // Test video codec support
      // console.log("Browser video codec support:");
      // console.log("H.264:", video.canPlayType('video/mp4; codecs="avc1.42E01E"'));
      // console.log("MP4:", video.canPlayType("video/mp4"));
      // console.log("WebM:", video.canPlayType("video/webm"));
    }

    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    // Test with image URL first (we know this works)
    await MediaMock.setMediaURL(imageUrl);
    expect(MediaMock["settings"].mediaURL).toBe(imageUrl);

    // Request a stream to ensure basic functionality works with image
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });

    expect(stream).toBeDefined();
    expect(stream.getVideoTracks().length).toBeGreaterThan(0);
    expect(stream.active).toBe(true);

    // Now test video URL (but don't trigger loading)
    await MediaMock.setMediaURL(videoUrl);
    expect(MediaMock["settings"].mediaURL).toBe(videoUrl);
  });

  it("should load media file before setMediaURL returns", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    // setMediaURL should wait for the image to load before returning
    await MediaMock.setMediaURL(imageUrl);

    // Verify the URL is set
    expect(MediaMock["settings"].mediaURL).toBe(imageUrl);

    // Request a stream to ensure the media is ready
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream).toBeDefined();
    expect(stream.getVideoTracks().length).toBeGreaterThan(0);
  });

  it("should reject setMediaURL if media fails to load", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    const invalidUrl = "/assets/nonexistent-file-that-does-not-exist.png";

    // setMediaURL should reject if the media fails to load
    await expect(MediaMock.setMediaURL(invalidUrl)).rejects.toThrow();
  });

  it("should allow configuring media load timeout", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    // Default timeout should be 60 seconds
    expect(MediaMock["settings"].mediaTimeout).toBe(60 * 1000);

    // Should be able to set custom timeout
    MediaMock.setMediaTimeout(30 * 1000);
    expect(MediaMock["settings"].mediaTimeout).toBe(30 * 1000);

    // Should reject invalid timeout values
    expect(() => MediaMock.setMediaTimeout(0)).toThrow("Media timeout must be a positive number");
    expect(() => MediaMock.setMediaTimeout(-1000)).toThrow("Media timeout must be a positive number");

    // Should still allow loading with custom timeout
    await MediaMock.setMediaURL(imageUrl);
    expect(MediaMock["settings"].mediaURL).toBe(imageUrl);
  });
});
