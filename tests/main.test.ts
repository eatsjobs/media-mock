import { describe, it, expect, beforeEach, vi } from "vitest";
import { MediaMock, createMediaDeviceInfo, devices } from "../lib/main";
import userEvent from "@testing-library/user-event";

describe("MediaMock", () => {
  const imageUrl = "/assets/ean8_12345670.png";
  const videoAssetURL = "/assets/hd_1280_720_25fps.mp4";

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
      devices["iPhone 12"].supportedConstraints
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
      devices["iPhone 12"]
    );

    expect(resolution).toEqual({ width: 1920, height: 1080 });
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
    expect(settings.width).toBe(1920);
    expect(settings.height).toBe(1080);
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
      })
    );
  });
});
