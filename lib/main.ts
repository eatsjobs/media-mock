import {
  extractDeviceId,
  extractFacingMode,
  extractFrameRate,
} from "./constraints";
import {
  createGetUserMediaError,
  type GetUserMediaErrorName,
  type SimulatedErrorOptions,
} from "./createGetUserMediaError";
import {
  type MockMediaDeviceInfo,
  redactMediaDeviceInfo,
} from "./createMediaDeviceInfo";
import {
  type DeviceConfig,
  devices,
  type SupportedConstraints,
} from "./devices";
import { type Resolution, resolveResolution } from "./resolution";
import { createSourceFromURL } from "./sources/createSource";
import { hideOffscreen, showForDebug } from "./sources/elementVisibility";
import type { FrameSource } from "./sources/FrameSource";

export interface MockOptions {
  mediaDevices: {
    getUserMedia: boolean;
    getSupportedConstraints: boolean;
    enumerateDevices: boolean;
  };
}

function createDefaultMockOptions(): MockOptions {
  return {
    mediaDevices: {
      getUserMedia: true,
      getSupportedConstraints: true,
      enumerateDevices: true,
    },
  };
}

/**
 * Controls the timer used for the canvas drawing loop that feeds captureStream.
 *
 * - `Auto` — uses `setInterval` when `requestAnimationFrame` may be throttled
 *   (detected by checking `document.hidden`), otherwise uses `requestAnimationFrame`.
 * - `Raf` — always uses `requestAnimationFrame`.
 * - `SetInterval` — always uses `setInterval`. More reliable in headless/virtual
 *   display environments (e.g. xvfb) where webkit throttles rAF for inactive pages,
 *   causing `captureStream` to stop emitting frames.
 */
export enum TimerMode {
  Auto = "auto",
  Raf = "raf",
  SetInterval = "setInterval",
}

export interface Settings {
  /**
   * The media url to use for the mock. Video or image.
   * @type {string}
   */
  mediaURL: string;

  /**
   * The preset device config to emulate
   *
   * @type {DeviceConfig}
   */
  device: DeviceConfig;

  /**
   * The constraint names reported by the mocked getSupportedConstraints().
   * Kept in sync with the mocked device by mock().
   * @type {SupportedConstraints}
   */
  constraints: SupportedConstraints;

  /**
   * Scale factor for the image in the canvas (0-1)
   * Lower values create more margin, higher values fill more of the canvas
   * @type {number}
   */
  canvasScaleFactor: number;

  /**
   * Timeout for media loading (image and video) in milliseconds
   * @type {number}
   * @default 60000 (60 seconds)
   */
  mediaTimeout: number;

  /**
   * Timer strategy for the canvas drawing loop.
   * @type {TimerMode}
   * @default TimerMode.SetInterval
   * @see TimerMode
   */
  timerMode: TimerMode;
}

/**
 * Check if RequestAnimationFrame is supported
 */
function isRAFSupported(): boolean {
  return typeof requestAnimationFrame === "function";
}

/**
 * Whether the viewport is currently taller than it is wide. Resolution matching
 * needs this to decide whether to report a landscape mode swapped.
 */
function isPortraitViewport(): boolean {
  return window.innerHeight > window.innerWidth;
}

/**
 * MediaMock class.
 *
 * @example
 * ```ts
 * import { MediaMock, devices } from "@eatsjobs/media-mock";
 *   // Configure and initialize MediaMock with default settings
 *   MediaMock.mock(devices["iPhone 12"]); // or devices["Samsung Galaxy M53"] for Android, "Mac Desktop" for desktop mediaDevice emulation
 *   await MediaMock.setMediaURL("./assets/640x480-sample.png");
 *
 *   // Set up a video element to display the stream
 *   const videoElement = document.createElement("video");
 *   document.body.appendChild(videoElement);
 *
 *   videoElement.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
 *   videoElement.play();
 * ```
 * @export
 * @class MediaMockClass
 */
export class MediaMockClass {
  public settings: Settings = {
    mediaURL:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgQn2nAAAAABJRU5ErkJggg==",
    device: devices["iPhone 12"],
    constraints: devices["iPhone 12"].supportedConstraints,
    canvasScaleFactor: 1,
    mediaTimeout: 60 * 1000, // 60 seconds
    timerMode: TimerMode.SetInterval,
  };

  private readonly mediaMockCanvasId = "media-mock-canvas";

  /** What paints the frames — an image, a video, or anything implementing FrameSource. */
  private source: FrameSource | undefined;

  private mapUnmockFunction: Map<
    keyof MockOptions["mediaDevices"],
    VoidFunction
  > = new Map();

  private currentStream: (MediaStream & { stop?: VoidFunction }) | undefined;

  private intervalId: ReturnType<typeof setTimeout> | null = null;

  private rafId: ReturnType<typeof requestAnimationFrame> | null = null;

  private debug: boolean = false;

  private canvas: HTMLCanvasElement | undefined | null = undefined;

  private ctx: CanvasRenderingContext2D | null | undefined = undefined;

  private mockedVideoTracksHandler: (
    tracks: MediaStreamTrack[],
  ) => MediaStreamTrack[] = (tracks) => tracks;

  private fps: number = 30;
  private resolution: Resolution = {
    width: 640,
    height: 480,
  };

  private lastDrawTime: number = 0;

  /**
   * The error every mocked getUserMedia call should reject with, or null to
   * stream normally. Stored as name + options rather than an Error instance so
   * each rejection constructs a fresh error, like real browsers do.
   */
  private simulatedGetUserMediaError: {
    name: GetUserMediaErrorName;
    options?: SimulatedErrorOptions;
  } | null = null;

  /**
   * The Image or the video that will be used as source.
   * @public
   * @param {string} mediaURL
   * @returns {Promise<MediaMockClass>}
   */
  public async setMediaURL(mediaURL: string): Promise<MediaMockClass> {
    // Validate input
    if (!mediaURL || typeof mediaURL !== "string" || mediaURL.trim() === "") {
      throw new Error("Invalid mediaURL: must be a non-empty string");
    }

    const source = createSourceFromURL(mediaURL, {
      timeoutMs: this.settings.mediaTimeout,
      scaleFactor: () => this.settings.canvasScaleFactor,
    });

    // Load and validate the NEW source before touching any existing state, so a
    // failed load leaves the current stream running.
    await source.prepare?.();

    this.source?.dispose?.();
    this.source = source;
    this.settings.mediaURL = mediaURL;

    if (this.debug && source.element) {
      showForDebug(source.element);
    }

    // Restart drawing with the new source if a stream is active. The loop
    // redraws immediately, so the canvas (and the captured track) picks up the
    // new content without a gap.
    if (this.intervalId !== null || this.rafId !== null) {
      await this.startDrawingLoop();
    }
    return this;
  }

  private async startDrawingLoop(): Promise<void> {
    // Stop any existing drawing loop
    this.stopDrawingLoop();

    const source = this.source;
    if (!source) {
      throw new Error("No media source loaded");
    }

    const { width, height } = this.resolution;

    if (this.debug) {
      const { width: sourceWidth, height: sourceHeight } = source.size;
      console.log(`
          Canvas: ${width}x${height},
          Source: ${sourceWidth}x${sourceHeight}`);
    }

    const drawFrame = () => {
      if (!this.ctx) {
        return;
      }
      source.drawInto(this.ctx, width, height);
    };

    // Draw the first frame synchronously so captureStream sees content
    // immediately, then force the pixels to commit: on some webkit versions
    // drawing to a freshly created canvas does not commit until something reads
    // back, which would otherwise start the capture on a blank frame.
    drawFrame();
    this.ctx?.getImageData(0, 0, 1, 1);

    const frameInterval = 1000 / this.fps;
    this.lastDrawTime = performance.now();

    if (this.resolveTimerMode() === TimerMode.Raf && isRAFSupported()) {
      // rAF fires at display rate; throttle draws to the requested FPS.
      const rafLoop = () => {
        const now = performance.now();
        if (now - this.lastDrawTime >= frameInterval) {
          drawFrame();
          this.lastDrawTime = now;
        }
        this.rafId = requestAnimationFrame(rafLoop);
      };
      this.rafId = requestAnimationFrame(rafLoop);
    } else {
      // setInterval fires reliably even when rAF is throttled (e.g. webkit under xvfb)
      this.intervalId = setInterval(drawFrame, frameInterval);
    }
  }

  /**
   * Stop the drawing loop (either RAF or setInterval)
   */
  private stopDrawingLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.lastDrawTime = 0;
  }

  /**
   * Add a new device and trigger a device change event.
   *
   * @public
   * @param {MockMediaDeviceInfo} newDevice
   */
  public addMockDevice(newDevice: MockMediaDeviceInfo): typeof MediaMock {
    this.settings.device.mediaDeviceInfo.push(newDevice);
    this.triggerDeviceChange();
    return this;
  }

  /**
   * Remove a device and trigger a device change event.
   *
   * @public
   * @param {string} deviceId
   */
  public removeMockDevice(deviceId: string): typeof MediaMock {
    this.settings.device.mediaDeviceInfo =
      this.settings.device.mediaDeviceInfo.filter(
        (device) => device.deviceId !== deviceId,
      );
    this.triggerDeviceChange();
    return this;
  }

  private triggerDeviceChange(): void {
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  }

  /**
   * Debug mode will append the canvas and loaded image to the body if available.
   *
   * @public
   */
  public enableDebugMode(): typeof MediaMock {
    this.debug = true;

    // The canvas is already attached to the DOM (hidden offscreen) by getMockStream.
    // In debug mode we just flip it visible and add a red border.
    if (this.canvas != null) {
      this.applyVisibleCanvasStyles(this.canvas);
    }

    const element = this.source?.element;
    if (element != null) {
      if (element.parentNode == null && document.body) {
        document.body.append(element);
      }
      showForDebug(element);
    }

    return this;
  }

  /**
   * Hides the source canvas and the source element again (both stay in the DOM
   * offscreen so captureStream and webkit's decoded-pixel cache keep working).
   *
   * @public
   * @returns {typeof MediaMock}
   */
  public disableDebugMode(): typeof MediaMock {
    this.debug = false;

    if (this.canvas != null) {
      this.applyHiddenCanvasStyles(this.canvas);
    }

    const element = this.source?.element;
    if (element != null) {
      hideOffscreen(element);
    }

    return this;
  }

  /**
   * Positions the source canvas offscreen but keeps it at its natural drawing-
   * buffer size so captureStream sees a non-zero rendering rectangle. On some
   * webkit versions, shrinking the displayed canvas with CSS width/height causes
   * the captured track's intrinsic dimensions to collapse — so we move it offscreen
   * via `left: -9999px` instead of resizing it.
   */
  private applyHiddenCanvasStyles(canvas: HTMLCanvasElement): void {
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "-9999px";
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.style.opacity = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.border = "";
    canvas.setAttribute("aria-hidden", "true");
  }

  /**
   * Restores the source canvas to its natural size and makes it visible (used by
   * debug mode).
   */
  private applyVisibleCanvasStyles(canvas: HTMLCanvasElement): void {
    canvas.style.position = "";
    canvas.style.top = "";
    canvas.style.left = "";
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.style.opacity = "";
    canvas.style.pointerEvents = "";
    canvas.style.border = "10px solid red";
    canvas.removeAttribute("aria-hidden");
  }

  public setMockedVideoTracksHandler(
    mockedVideoTracksHandler: (
      tracks: MediaStreamTrack[],
    ) => MediaStreamTrack[],
  ): typeof MediaMock {
    this.mockedVideoTracksHandler = mockedVideoTracksHandler;
    return this;
  }

  /**
   * Replaces the navigator.mediaDevices functions.
   *
   * @public
   * @param {DeviceConfig} device
   * @param {MockOptions} [options=createDefaultMockOptions()]
   * @returns {typeof MediaMock}
   */
  public mock(
    device: DeviceConfig,
    options: MockOptions = createDefaultMockOptions(),
  ): typeof MediaMock {
    // Clone the config so addMockDevice/removeMockDevice never mutate the
    // caller's object (the exported presets are shared across tests).
    this.settings.device = {
      ...device,
      videoResolutions: device.videoResolutions.map((res) => ({ ...res })),
      mediaDeviceInfo: [...device.mediaDeviceInfo],
      supportedConstraints: { ...device.supportedConstraints },
    };
    this.settings.constraints = this.settings.device.supportedConstraints;

    if (typeof MediaDevices === "undefined") {
      console.warn(
        "MediaDevices is not available in this environment — mock() has no effect.",
      );
      return this;
    }

    // biome-ignore lint/suspicious/noExplicitAny: patching prototype properties by name requires any
    type AnyFn = (...args: any[]) => any;
    const proto = MediaDevices.prototype as unknown as Record<string, AnyFn>;

    const patchProto = (
      key: keyof MockOptions["mediaDevices"],
      mockFn: AnyFn,
    ): void => {
      // Only capture the original on the first patch — on repeated mock() calls
      // without unmock(), proto[key] is already our mock and saving it would
      // permanently lose the native implementation.
      if (!this.mapUnmockFunction.has(key)) {
        const original = proto[key];
        this.mapUnmockFunction.set(key, () => {
          proto[key] = original;
        });
      }
      proto[key] = mockFn;
    };

    if (options?.mediaDevices.getUserMedia) {
      patchProto("getUserMedia", (constraints: MediaStreamConstraints) =>
        this.getMockStream(constraints),
      );
    }

    if (options?.mediaDevices.getSupportedConstraints) {
      patchProto("getSupportedConstraints", () => this.settings.constraints);
    }

    if (options?.mediaDevices.enumerateDevices) {
      patchProto("enumerateDevices", async () => this.enumerateMockDevices());
    }

    return this;
  }

  /**
   * Stops the mock and removes the mock functions.
   *
   * @public
   * @returns {typeof MediaMock}
   */
  public unmock(): typeof MediaMock {
    this.stopMockStream();
    this.disableDebugMode();
    this.mockedVideoTracksHandler = (tracks) => tracks;
    this.simulatedGetUserMediaError = null;
    this.mapUnmockFunction.forEach((unmock) => {
      unmock();
    });
    this.mapUnmockFunction.clear();

    return this;
  }

  private stopMockStream(): void {
    // Stop the drawing loop (cancels RAF or clears interval)
    this.stopDrawingLoop();

    this.currentStream?.getVideoTracks()?.forEach((track) => {
      track.stop();
    });
    this.currentStream?.stop?.(); // Stop the stream if needed
    this.currentStream = undefined;

    this.source?.dispose?.();
    this.source = undefined;

    // Clean up canvas and context
    if (this.canvas) {
      // Remove from DOM if present
      if (this.canvas.parentNode) {
        this.canvas.remove();
      }
      this.canvas = undefined;
    }
    this.ctx = undefined;
  }

  /**
   * Set the scale factor for the image in the canvas.
   * Values between 0 and N, where lower values create more margin,
   * and higher values fill more of the canvas.
   *
   * @public
   * @param {number} factor - Scale factor between 0 and N
   * @returns {typeof MediaMock}
   */
  public setCanvasScaleFactor(factor: number): typeof MediaMock {
    this.settings.canvasScaleFactor = Math.max(0.1, factor);
    return this;
  }

  /**
   * Set the timeout for media loading (images and videos) in milliseconds.
   *
   * @public
   * @param {number} timeoutMs - Timeout in milliseconds (default: 60000 = 60 seconds)
   * @returns {typeof MediaMock}
   */
  public setMediaTimeout(timeoutMs: number): typeof MediaMock {
    if (timeoutMs <= 0) {
      throw new Error("Media timeout must be a positive number");
    }
    this.settings.mediaTimeout = timeoutMs;
    return this;
  }

  /**
   * Set the timer strategy used for the canvas drawing loop.
   *
   * @public
   * @param {TimerMode} mode - TimerMode.Auto | TimerMode.Raf | TimerMode.SetInterval
   * @returns {typeof MediaMock}
   */
  public setTimerMode(mode: TimerMode): typeof MediaMock {
    this.settings.timerMode = mode;
    return this;
  }

  /**
   * Makes every subsequent `getUserMedia` call reject with the given error
   * instead of returning a stream. Stays in effect until
   * `clearGetUserMediaError()` or `unmock()` is called.
   *
   * @public
   * @param {GetUserMediaErrorName} name - e.g. "NotAllowedError"
   * @param {SimulatedErrorOptions} [options] - custom message, or the offending
   * constraint name for "OverconstrainedError"
   * @returns {typeof MediaMock}
   */
  public simulateGetUserMediaError(
    name: GetUserMediaErrorName,
    options?: SimulatedErrorOptions,
  ): typeof MediaMock {
    this.simulatedGetUserMediaError = { name, options };
    return this;
  }

  /**
   * Stops simulating a `getUserMedia` failure, so subsequent calls return a
   * mock stream again.
   *
   * @public
   * @returns {typeof MediaMock}
   */
  public clearGetUserMediaError(): typeof MediaMock {
    this.simulatedGetUserMediaError = null;
    return this;
  }

  /**
   * The device list returned by the mocked enumerateDevices. While a
   * "NotAllowedError" is simulated, entries are redacted instead of the call
   * rejecting — that is what real browsers do before permission is granted.
   */
  private enumerateMockDevices(): MockMediaDeviceInfo[] {
    if (this.simulatedGetUserMediaError?.name === "NotAllowedError") {
      return this.settings.device.mediaDeviceInfo.map(redactMediaDeviceInfo);
    }
    return this.settings.device.mediaDeviceInfo;
  }

  /**
   * Resolves the effective timer mode. "auto" uses setInterval when the document
   * is hidden (e.g. under xvfb where webkit throttles rAF), otherwise rAF.
   */
  private resolveTimerMode(): TimerMode.Raf | TimerMode.SetInterval {
    if (this.settings.timerMode === TimerMode.Raf) return TimerMode.Raf;
    if (this.settings.timerMode === TimerMode.SetInterval)
      return TimerMode.SetInterval;
    // Auto: fall back to setInterval when the page may not be compositing
    const pageHidden =
      typeof document !== "undefined" &&
      typeof document.hidden !== "undefined" &&
      document.hidden;
    return pageHidden || !isRAFSupported()
      ? TimerMode.SetInterval
      : TimerMode.Raf;
  }

  private async getMockStream(
    constraints: MediaStreamConstraints,
  ): Promise<MediaStream> {
    // Reject before touching the canvas or loading any media, like a real
    // browser that fails permission or device selection up front.
    if (this.simulatedGetUserMediaError !== null) {
      throw createGetUserMediaError(
        this.simulatedGetUserMediaError.name,
        this.simulatedGetUserMediaError.options,
      );
    }

    this.resolution = resolveResolution(
      constraints,
      this.settings.device.videoResolutions,
      isPortraitViewport(),
    );

    this.fps = extractFrameRate(constraints);

    // Remove any prior canvas from the DOM before swapping in a new one (e.g. when
    // a consumer calls getUserMedia again to switch cameras).
    if (this.canvas?.parentNode) {
      this.canvas.remove();
    }

    this.canvas = document.createElement("canvas");
    this.canvas.id = this.mediaMockCanvasId;

    const { width, height } = this.resolution;

    this.canvas.width = width;
    this.canvas.height = height;

    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!this.ctx) {
      throw new Error("Failed to get 2D canvas context");
    }

    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, width, height);

    // The canvas must live in the document for HTMLCanvasElement.captureStream() to
    // produce a track whose intrinsic dimensions stay stable. On some browser
    // versions (e.g. WebKit 26-class running under xvfb), a detached canvas
    // produces a track whose videoWidth/videoHeight transiently report valid values
    // and then drop to 2×2, breaking <video> consumers. Hidden offscreen by default;
    // enableDebugMode() makes it visible.
    this.applyHiddenCanvasStyles(this.canvas);
    if (typeof document.body !== "undefined" && document.body !== null) {
      document.body.append(this.canvas);
    }

    await this.setMediaURL(this.settings.mediaURL);
    await this.startDrawingLoop();

    if (this.debug) {
      this.enableDebugMode();
    }

    // For the captureStream, we use the fps parameter directly
    const canvasStream = this.canvas.captureStream(this.fps);

    const videoTracks = canvasStream?.getVideoTracks() ?? [];

    // Prefer an explicit deviceId from constraints — real browsers honor this. Fall
    // back to facingMode-based selection, then to the first videoinput.
    const requestedDeviceId = extractDeviceId(constraints);
    const facingMode = extractFacingMode(constraints);
    let videoDevice: MockMediaDeviceInfo | undefined;
    if (requestedDeviceId) {
      videoDevice = this.settings.device.mediaDeviceInfo.find(
        (device) =>
          device.kind === "videoinput" && device.deviceId === requestedDeviceId,
      );
    }
    if (!videoDevice) {
      videoDevice = this.getDeviceForFacingMode(
        facingMode,
        this.settings.device,
      );
    }

    videoTracks.forEach((track: MediaStreamTrack) => {
      // Set the track label to match the selected device label
      if (videoDevice?.label) {
        Object.defineProperty(track, "label", {
          value: videoDevice.label,
          writable: false,
          configurable: false,
        });
      }

      // Set the track id (deviceId) to match the selected device
      if (videoDevice?.deviceId) {
        Object.defineProperty(track, "id", {
          value: videoDevice.deviceId,
          writable: false,
          configurable: false,
        });
      }

      // Ensure getCapabilities method is always available (all real devices have this)
      if (!track.getCapabilities) {
        if (videoDevice?.getCapabilities) {
          // Use the device-specific capabilities from mockCapabilities
          // Bind to track so 'this' refers to the track
          track.getCapabilities = function (this: MediaStreamTrack) {
            return videoDevice.getCapabilities();
          }.bind(track);
        } else {
          // Fallback to device resolutions if no specific capabilities defined
          const deviceResolutions = this.settings.device.videoResolutions;
          const widths = deviceResolutions.map((res) => res.width);
          const heights = deviceResolutions.map((res) => res.height);

          track.getCapabilities = function (this: MediaStreamTrack) {
            return {
              width: { min: Math.min(...widths), max: Math.max(...widths) },
              height: { min: Math.min(...heights), max: Math.max(...heights) },
              frameRate: { min: 1, max: 60 },
              facingMode: ["user", "environment"],
              resizeMode: ["none", "crop-and-scale"],
            };
          }.bind(track);
        }
      }

      // Enhance getSettings to provide consistent real-device behavior
      const originalGetSettings = track.getSettings.bind(track);
      track.getSettings = () => {
        const settings = originalGetSettings();

        // Real devices always provide frameRate in settings
        if (settings.frameRate === undefined) {
          settings.frameRate = this.fps;
        }

        // Real devices always provide width/height in settings
        if (settings.width === undefined || settings.height === undefined) {
          settings.width = this.resolution.width;
          settings.height = this.resolution.height;
        }

        // Real devices always expose the source device's deviceId — overwrite the
        // canvas-stream's synthetic track id so consumers can confirm which device
        // this stream came from. Some browsers populate settings.deviceId with the
        // underlying MediaStreamTrack id (a random uuid), which is misleading.
        if (videoDevice?.deviceId) {
          settings.deviceId = videoDevice.deviceId;
        }

        // Expose facingMode when known — many consumers read this to disambiguate
        // front vs back cameras (especially on iOS Safari, where the same physical
        // back camera can be advertised under multiple labels).
        if (settings.facingMode === undefined) {
          const capabilities = videoDevice?.getCapabilities?.();
          const supportedFacingModes = capabilities?.facingMode;
          if (
            Array.isArray(supportedFacingModes) &&
            supportedFacingModes.length > 0
          ) {
            settings.facingMode = supportedFacingModes[0];
          }
        }

        return settings;
      };
    });

    this.currentStream = new MediaStream(
      this.mockedVideoTracksHandler(videoTracks),
    );

    return this.currentStream;
  }

  /**
   * Get the appropriate camera device based on facingMode
   * Falls back to last videoinput if no matching camera found
   */
  private getDeviceForFacingMode(
    facingMode: string | null,
    device: DeviceConfig,
  ): MockMediaDeviceInfo | undefined {
    const videoDevices = device.mediaDeviceInfo.filter(
      (d) => d.kind === "videoinput",
    );

    if (!videoDevices.length) {
      return undefined;
    }

    if (!facingMode) {
      return videoDevices[0];
    }

    // Find all devices that support the requested facingMode and return the last one
    // This usually is the Back Camera or camera2 0, facing back for the given default devices
    const matchingDevices = videoDevices.filter((d) => {
      const capabilities = d.getCapabilities();
      const supportedFacingModes = capabilities.facingMode;
      return (
        Array.isArray(supportedFacingModes) &&
        supportedFacingModes.includes(facingMode)
      );
    });

    // Return the last matching device if found, otherwise fall back to first videoinput
    return matchingDevices.length > 0
      ? matchingDevices[matchingDevices.length - 1]
      : videoDevices[0];
  }
}

export * from "./createMediaDeviceInfo";
export {
  type DeviceConfig,
  devices,
  type GetUserMediaErrorName,
  type SimulatedErrorOptions,
  type SupportedConstraints,
};
export const MediaMock: MediaMockClass = new MediaMockClass();
