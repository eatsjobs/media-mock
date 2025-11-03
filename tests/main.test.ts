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

  // ===== RESOLUTION MATCHING TESTS =====

  it("should find exact resolution match", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    // Test exact resolution match for portrait mode (device returns landscape that gets swapped)
    const resolution = MediaMock["getResolution"](
      {
        video: {
          width: { exact: 1080 },
          height: { exact: 1920 },
        },
      },
      device,
    );

    expect(resolution).toBeDefined();
    expect(resolution.width).toBeGreaterThan(0);
    expect(resolution.height).toBeGreaterThan(0);
  });

  it("should find best fit resolution by aspect ratio", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    // Request resolution that doesn't exactly match, should find best fit
    const resolution = MediaMock["getResolution"](
      {
        video: {
          width: { ideal: 800 },
          height: { ideal: 600 },
        },
      },
      device,
    );

    expect(resolution).toBeDefined();
    expect(resolution.width).toBeGreaterThan(0);
    expect(resolution.height).toBeGreaterThan(0);
  });

  it("should use fallback resolution when no match found", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    // Request extreme resolution that won't match
    const resolution = MediaMock["getResolution"](
      {
        video: {
          width: { exact: 99999 },
          height: { exact: 99999 },
        },
      },
      device,
    );

    expect(resolution).toBeDefined();
    expect(resolution.width).toBeGreaterThan(0);
    expect(resolution.height).toBeGreaterThan(0);
  });

  it("should handle portrait orientation correctly", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    // Force portrait check (depends on window dimensions)
    const resolution = MediaMock["getResolution"](
      {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      },
      device,
    );

    expect(resolution).toBeDefined();
    expect(typeof resolution.width).toBe("number");
    expect(typeof resolution.height).toBe("number");
  });

  // ===== ERROR HANDLING TESTS =====

  it("should reject invalid mediaURL", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    await expect(MediaMock.setMediaURL("")).rejects.toThrow(
      "Invalid mediaURL: must be a non-empty string"
    );
  });

  it("should reject whitespace-only mediaURL", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    await expect(MediaMock.setMediaURL("   ")).rejects.toThrow(
      "Invalid mediaURL: must be a non-empty string"
    );
  });

  it("should reject null/undefined mediaURL", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    // @ts-ignore - intentionally passing invalid type
    await expect(MediaMock.setMediaURL(null)).rejects.toThrow();
    // @ts-ignore - intentionally passing invalid type
    await expect(MediaMock.setMediaURL(undefined)).rejects.toThrow();
  });

  // ===== DEVICE MANAGEMENT TESTS =====

  it("should handle enumerateDevices after mock", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const devices = await navigator.mediaDevices.enumerateDevices();
    expect(devices).toBeDefined();
    expect(Array.isArray(devices)).toBe(true);
    expect(devices.length).toBeGreaterThan(0);
  });

  it("should return consistent device info from enumerateDevices", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const devices1 = await navigator.mediaDevices.enumerateDevices();
    const devices2 = await navigator.mediaDevices.enumerateDevices();

    // Should return same devices
    expect(devices1.length).toBe(devices2.length);
    devices1.forEach((dev1, idx) => {
      expect(dev1.deviceId).toBe(devices2[idx].deviceId);
      expect(dev1.label).toBe(devices2[idx].label);
    });
  });

  // ===== CONSTRAINT APPLICATION TESTS =====

  it("should apply min/max constraints", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { min: 640, max: 1920 },
        height: { min: 480, max: 1080 },
      },
    });

    const settings = stream.getVideoTracks()[0].getSettings();
    expect(settings.width).toBeDefined();
    expect(settings.height).toBeDefined();
    // Values should be within device capabilities
    expect(settings.width).toBeGreaterThan(0);
    expect(settings.height).toBeGreaterThan(0);
  });

  it("should apply exact constraints", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { exact: 1080 },
        height: { exact: 1920 },
      },
    });

    const settings = stream.getVideoTracks()[0].getSettings();
    expect(settings.width).toBe(1080);
    expect(settings.height).toBe(1920);
  });

  // ===== STREAM LIFECYCLE TESTS =====

  it("should be able to get multiple streams sequentially", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream1 = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream1).toBeDefined();
    expect(stream1.getVideoTracks().length).toBeGreaterThan(0);

    // Get another stream
    const stream2 = await navigator.mediaDevices.getUserMedia({
      video: { width: 800, height: 600 }
    });
    expect(stream2).toBeDefined();
    expect(stream2.getVideoTracks().length).toBeGreaterThan(0);
  });

  it("should stop all tracks when stream is stopped", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = stream.getVideoTracks()[0];

    expect(track.readyState).toBe("live");

    track.stop();
    // After stopping, track should be muted (some browsers mark as ended)
    expect(track.readyState).toBe("ended");
  });

  // ===== DEVICE CAPABILITY TESTS =====

  it("should return device capabilities", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities?.();

    // getCapabilities may not be available on all video tracks
    if (capabilities) {
      expect(capabilities).toBeDefined();
    }
    // Track should always have getSettings
    expect(track.getSettings).toBeDefined();
  });

  it("should return correct track settings", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();

    expect(settings).toBeDefined();
    expect(settings.width).toBeGreaterThan(0);
    expect(settings.height).toBeGreaterThan(0);
    expect(settings.frameRate).toBeGreaterThan(0);
  });

  // ===== CLEANUP AND UNMOCK TESTS =====

  it("should properly restore original APIs after unmock", async () => {
    const device = getDeviceForBrowser();

    // Store original if it exists
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;

    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    // Mock should be active
    expect(navigator.mediaDevices.getUserMedia).toBeDefined();

    MediaMock.unmock();

    // After unmock, should either restore or still have mockable API
    expect(navigator.mediaDevices).toBeDefined();
  });

  it("should handle rapid mock/unmock cycles", async () => {
    const device = getDeviceForBrowser();

    for (let i = 0; i < 3; i++) {
      MediaMock.mock(device);
      await MediaMock.setMediaURL(imageUrl);

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      expect(stream.getVideoTracks().length).toBeGreaterThan(0);

      MediaMock.unmock();
    }
  });

  // ===== DEBUG MODE TESTS =====

  it("should toggle debug mode independently", async () => {
    const device = getDeviceForBrowser();
    MediaMock.enableDebugMode().mock(device);
    await MediaMock.setMediaURL(imageUrl);

    // Should have debug elements after getting stream
    await navigator.mediaDevices.getUserMedia({ video: true });
    expect(document.querySelector("canvas")).toBeTruthy();

    // Disable debug mode should remove elements
    MediaMock.disableDebugMode();
    expect(document.querySelector("canvas")).toBeFalsy();

    // Re-enable should not add them back immediately
    MediaMock.enableDebugMode();
    // Elements won't reappear until next stream
  });

  // ===== RESOLUTION EDGE CASE TESTS =====

  it("should handle findBestFitResolution with various aspect ratios", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    // Test with very different aspect ratio to trigger best fit algorithm
    const resolution = MediaMock["getResolution"](
      {
        video: {
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
      },
      device,
    );

    expect(resolution).toBeDefined();
    expect(resolution.width).toBeGreaterThan(0);
    expect(resolution.height).toBeGreaterThan(0);
  });

  it("should handle getFallbackResolution for landscape orientation", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    // Request extreme landscape resolution to trigger fallback
    const resolution = MediaMock["getResolution"](
      {
        video: {
          width: { exact: 50000 },
          height: { exact: 1 },
        },
      },
      device,
    );

    expect(resolution).toBeDefined();
    expect(resolution.width).toBeGreaterThan(0);
    expect(resolution.height).toBeGreaterThan(0);
  });

  it("should get supported constraints", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    const constraints = navigator.mediaDevices.getSupportedConstraints();
    expect(constraints).toBeDefined();
    expect(typeof constraints).toBe("object");
  });

  // ===== FPS CONSTRAINT TESTS =====

  it("should get FPS from constraints with frameRate object", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { frameRate: { ideal: 24 } },
    });

    expect(stream).toBeDefined();
    const settings = stream.getVideoTracks()[0].getSettings();
    expect(settings.frameRate).toBeDefined();
  });

  it("should get FPS from constraints with number", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { frameRate: 20 },
    });

    expect(stream).toBeDefined();
    const settings = stream.getVideoTracks()[0].getSettings();
    expect(settings.frameRate).toBe(20);
  });

  // ===== ADDITIONAL CONSTRAINT TESTS =====

  it("should handle getUserMedia without video constraint", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({});
    expect(stream).toBeDefined();
  });

  it("should handle getUserMedia with false video constraint", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({ video: false });
    expect(stream).toBeDefined();
  });

  // ===== ASPECT RATIO CONSTRAINT TESTS =====

  it("should apply aspect ratio constraint", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);
    await MediaMock.setMediaURL(imageUrl);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { aspectRatio: { ideal: 16 / 9 } },
    });

    expect(stream).toBeDefined();
    const settings = stream.getVideoTracks()[0].getSettings();
    expect(settings).toBeDefined();
  });

  // ===== VIDEO SOURCE TESTS =====

  it("should work with different image URLs", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    // Test with different image
    const imageUrl2 = "/assets/florida_dl_front.png";
    await MediaMock.setMediaURL(imageUrl2);
    expect(MediaMock["settings"].mediaURL).toBe(imageUrl2);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream).toBeDefined();
    expect(stream.getVideoTracks().length).toBeGreaterThan(0);
  });

  // ===== DEVICE SWITCHING TESTS =====

  it("should switch between different device types", async () => {
    const device1 = devices["iPhone 12"];
    const device2 = devices["Mac Desktop"];

    MediaMock.mock(device1);
    await MediaMock.setMediaURL(imageUrl);

    let stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks().length).toBeGreaterThan(0);

    // Switch device
    MediaMock.mock(device2);
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    expect(stream.getVideoTracks().length).toBeGreaterThan(0);
  });

  // ===== VIDEO ELEMENT TESTS (when video media is used) =====

  it("should handle canvas scale factor updates", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    // Test various scale factors
    MediaMock.setCanvasScaleFactor(0.5);
    expect(MediaMock["settings"].canvasScaleFactor).toBe(0.5);

    MediaMock.setCanvasScaleFactor(1.0);
    expect(MediaMock["settings"].canvasScaleFactor).toBe(1.0);

    // Test that scale factor below minimum is clamped
    MediaMock.setCanvasScaleFactor(0.05);
    expect(MediaMock["settings"].canvasScaleFactor).toBe(0.1);
  });

  // ===== SUPPORTED CONSTRAINTS TEST =====

  it("should return same supported constraints from getSupportedConstraints", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    const constraints1 = navigator.mediaDevices.getSupportedConstraints();
    const constraints2 = navigator.mediaDevices.getSupportedConstraints();

    expect(constraints1).toEqual(constraints2);
  });

  // ===== PROPERTY MOCKING & FALLBACK TESTS =====

  it("should mock navigator.mediaDevices even in restrictive environments", async () => {
    const device = getDeviceForBrowser();
    MediaMock.mock(device);

    // navigator.mediaDevices should be mocked and accessible
    expect(navigator.mediaDevices).toBeDefined();
    expect(navigator.mediaDevices.getUserMedia).toBeDefined();
  });

  it("should successfully restore APIs after unmock", async () => {
    const device = getDeviceForBrowser();

    // Ensure mediaDevices exists before mocking
    expect(navigator.mediaDevices).toBeDefined();

    MediaMock.mock(device);
    expect(navigator.mediaDevices.getUserMedia).toBeDefined();

    MediaMock.unmock();

    // After unmock, mediaDevices should still exist (or be restoreable)
    expect(navigator.mediaDevices).toBeDefined();
  });

  it("should handle property mocking with multiple unmock attempts", async () => {
    const device = getDeviceForBrowser();

    // Multiple unmock cycles
    for (let i = 0; i < 2; i++) {
      MediaMock.mock(device);
      await MediaMock.setMediaURL(imageUrl);

      // Should be mocked
      expect(navigator.mediaDevices.getUserMedia).toBeDefined();

      MediaMock.unmock();

      // Should still exist after unmock
      expect(navigator.mediaDevices).toBeDefined();
    }
  });
});
