import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createMediaMock,
  devices,
  MediaMock,
  MediaMockClass,
  TimerMode,
} from "../lib/main";

describe("2.0 API surface", () => {
  const imageUrl = "/assets/ean8_12345670.png";

  beforeEach(() => {
    MediaMock.unmock();
    MediaMock.configure({
      canvasScaleFactor: 1,
      mediaTimeout: 60_000,
      timerMode: TimerMode.SetInterval,
    });
  });

  afterAll(() => {
    MediaMock.unmock();
  });

  describe("configure", () => {
    it("should set every option and return the instance for chaining", () => {
      const returned = MediaMock.configure({
        canvasScaleFactor: 0.5,
        mediaTimeout: 1234,
        timerMode: TimerMode.Raf,
      });

      expect(returned).toBe(MediaMock);
      expect(MediaMock.settings.canvasScaleFactor).toBe(0.5);
      expect(MediaMock.settings.mediaTimeout).toBe(1234);
      expect(MediaMock.settings.timerMode).toBe(TimerMode.Raf);
    });

    it("should leave omitted options untouched", () => {
      MediaMock.configure({ canvasScaleFactor: 0.5 });
      MediaMock.configure({ mediaTimeout: 999 });

      expect(MediaMock.settings.canvasScaleFactor).toBe(0.5);
      expect(MediaMock.settings.mediaTimeout).toBe(999);
    });

    it("should reject a non-positive media timeout", () => {
      expect(() => MediaMock.configure({ mediaTimeout: 0 })).toThrow(
        /positive/i,
      );
      expect(() => MediaMock.configure({ mediaTimeout: -1 })).toThrow(
        /positive/i,
      );
    });

    it("should clamp the canvas scale factor to a drawable minimum", () => {
      MediaMock.configure({ canvasScaleFactor: 0 });
      expect(MediaMock.settings.canvasScaleFactor).toBe(0.1);
    });

    it("should be equivalent to the individual setters", () => {
      MediaMock.setCanvasScaleFactor(0.7)
        .setMediaTimeout(4321)
        .setTimerMode(TimerMode.Auto);

      expect(MediaMock.settings.canvasScaleFactor).toBe(0.7);
      expect(MediaMock.settings.mediaTimeout).toBe(4321);
      expect(MediaMock.settings.timerMode).toBe(TimerMode.Auto);
    });
  });

  describe("settings", () => {
    it("should stay readable", async () => {
      MediaMock.mock(devices["Mac Desktop"]);
      await MediaMock.setSource(imageUrl);

      expect(MediaMock.settings.mediaURL).toBe(imageUrl);
      expect(MediaMock.settings.device.mediaDeviceInfo.length).toBeGreaterThan(
        0,
      );
      expect(MediaMock.settings.constraints).toStrictEqual(
        devices["Mac Desktop"].supportedConstraints,
      );
    });

    it("should refuse writes at runtime", () => {
      expect(() => {
        (
          MediaMock.settings as { canvasScaleFactor: number }
        ).canvasScaleFactor = 0.2;
      }).toThrow(TypeError);

      expect(MediaMock.settings.canvasScaleFactor).toBe(1);
    });

    it("should reflect changes made through configure", () => {
      const before = MediaMock.settings.mediaTimeout;
      MediaMock.configure({ mediaTimeout: before + 1 });

      expect(MediaMock.settings.mediaTimeout).toBe(before + 1);
    });
  });

  describe("createMediaMock", () => {
    it("should return an independent instance", () => {
      const isolated = createMediaMock();

      expect(isolated).toBeInstanceOf(MediaMockClass);
      expect(isolated).not.toBe(MediaMock);
    });

    it("should not share settings with the singleton", () => {
      const isolated = createMediaMock();

      isolated.configure({ mediaTimeout: 5000 });

      expect(isolated.settings.mediaTimeout).toBe(5000);
      expect(MediaMock.settings.mediaTimeout).toBe(60_000);
    });

    it("should not share device state with the singleton", () => {
      const isolated = createMediaMock();

      isolated.mock(devices["Mac Desktop"]);
      MediaMock.mock(devices["iPhone 12"]);

      expect(isolated.settings.device.mediaDeviceInfo[0].label).toBe(
        devices["Mac Desktop"].mediaDeviceInfo[0].label,
      );
      expect(MediaMock.settings.device.mediaDeviceInfo[0].label).toBe(
        devices["iPhone 12"].mediaDeviceInfo[0].label,
      );

      isolated.unmock();
    });

    it("should stream independently of the singleton", async () => {
      const isolated = createMediaMock();
      isolated.mock(devices["Mac Desktop"]);
      await isolated.setSource(imageUrl);

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      expect(stream.getVideoTracks()[0].readyState).toBe("live");

      isolated.unmock();
    });
  });

  describe("removed API", () => {
    it("should no longer expose setMediaURL", () => {
      expect(
        (MediaMock as unknown as Record<string, unknown>).setMediaURL,
      ).toBeUndefined();
    });
  });
});
