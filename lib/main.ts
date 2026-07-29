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
import type { MockMediaDeviceInfo } from "./createMediaDeviceInfo";
import {
  cloneDeviceConfig,
  listDevices,
  selectVideoDevice,
} from "./deviceRegistry";
import {
  type DeviceConfig,
  devices,
  type SupportedConstraints,
} from "./devices";
import { MediaDevicesPatcher } from "./patchMediaDevices";
import { type Resolution, resolveResolution } from "./resolution";
import { CanvasSource } from "./sources/CanvasSource";
import { createSourceFromURL } from "./sources/createSource";
import { hideOffscreen, showForDebug } from "./sources/elementVisibility";
import type { FrameSource } from "./sources/FrameSource";
import { decorateVideoTrack } from "./track";

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

function isCanvasElement(value: unknown): value is HTMLCanvasElement {
  return (
    typeof HTMLCanvasElement !== "undefined" &&
    value instanceof HTMLCanvasElement
  );
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

  /**
   * Whether `canvas` was created here. A canvas borrowed from a consumer source
   * must never be restyled, detached or discarded.
   */
  private ownsCanvas: boolean = false;

  private readonly patcher = new MediaDevicesPatcher();

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
   * Sets what the mocked camera streams.
   *
   * @example
   * ```ts
   * await MediaMock.setSource("./assets/barcode.png");   // image
   * await MediaMock.setSource("./assets/clip.webm");     // video
   * await MediaMock.setSource(renderer.domElement);      // a 3D scene
   * await MediaMock.setSource(myOwnFrameSource);         // anything custom
   * ```
   *
   * A canvas is captured as-is: it is never resized, restyled, moved in the DOM
   * or removed, and the consumer's own render loop drives the frames.
   *
   * @public
   * @param {string | HTMLCanvasElement | FrameSource} source media URL, a canvas
   * you render into, or your own {@link FrameSource}
   * @returns {Promise<MediaMockClass>}
   */
  public async setSource(
    source: string | HTMLCanvasElement | FrameSource,
  ): Promise<MediaMockClass> {
    const frameSource = this.toFrameSource(source);

    // Prepare the NEW source before touching any existing state, so a failed
    // load leaves the current source — and any running stream — untouched.
    await frameSource.prepare?.();

    this.source?.dispose?.();
    this.source = frameSource;

    if (typeof source === "string") {
      this.settings.mediaURL = source;
    }

    if (this.debug && frameSource.element) {
      showForDebug(frameSource.element);
    }

    // Restart drawing with the new source if a stream is active. The loop
    // redraws immediately, so the canvas (and the captured track) picks up the
    // new content without a gap. A captured canvas has no loop to restart.
    if (
      !frameSource.captureCanvas &&
      (this.intervalId !== null || this.rafId !== null)
    ) {
      await this.startDrawingLoop();
    }
    return this;
  }

  /**
   * Normalises whatever was handed to {@link setSource} into a FrameSource.
   */
  private toFrameSource(
    source: string | HTMLCanvasElement | FrameSource,
  ): FrameSource {
    if (typeof source === "string") {
      if (source.trim() === "") {
        throw new Error("Invalid mediaURL: must be a non-empty string");
      }
      return createSourceFromURL(source, {
        timeoutMs: this.settings.mediaTimeout,
        scaleFactor: () => this.settings.canvasScaleFactor,
      });
    }

    if (isCanvasElement(source)) {
      return new CanvasSource(source);
    }

    if (
      typeof source === "object" &&
      source !== null &&
      (typeof source.drawInto === "function" || source.captureCanvas != null)
    ) {
      return source;
    }

    throw new Error(
      "Invalid source: expected a media URL, an HTMLCanvasElement, or a FrameSource",
    );
  }

  /**
   * The Image or the video that will be used as source.
   *
   * Superseded by {@link setSource}, which also accepts a canvas or a custom
   * FrameSource.
   *
   * @public
   * @param {string} mediaURL
   * @returns {Promise<MediaMockClass>}
   */
  public async setMediaURL(mediaURL: string): Promise<MediaMockClass> {
    if (!mediaURL || typeof mediaURL !== "string" || mediaURL.trim() === "") {
      throw new Error("Invalid mediaURL: must be a non-empty string");
    }
    return this.setSource(mediaURL);
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
      source.drawInto?.(this.ctx, width, height);
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

    // Our own canvas is already attached to the DOM (hidden offscreen) by
    // getMockStream; in debug mode we flip it visible and add a red border. A
    // canvas borrowed from the consumer is left alone — it is part of their page.
    if (this.canvas != null && this.ownsCanvas) {
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

    if (this.canvas != null && this.ownsCanvas) {
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
    this.settings.device = cloneDeviceConfig(device);
    this.settings.constraints = this.settings.device.supportedConstraints;

    if (!MediaDevicesPatcher.isSupported()) {
      console.warn(
        "MediaDevices is not available in this environment — mock() has no effect.",
      );
      return this;
    }

    if (options?.mediaDevices.getUserMedia) {
      this.patcher.patch(
        "getUserMedia",
        (constraints: MediaStreamConstraints) =>
          this.getMockStream(constraints),
      );
    }

    if (options?.mediaDevices.getSupportedConstraints) {
      this.patcher.patch(
        "getSupportedConstraints",
        () => this.settings.constraints,
      );
    }

    if (options?.mediaDevices.enumerateDevices) {
      this.patcher.patch("enumerateDevices", async () =>
        this.enumerateMockDevices(),
      );
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
    this.patcher.restoreAll();

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

    this.releaseCanvas();
  }

  /**
   * Drops the reference to the capture canvas, detaching it only if we created
   * it. A canvas borrowed from a consumer source stays in their page untouched.
   */
  private releaseCanvas(): void {
    if (this.canvas && this.ownsCanvas && this.canvas.parentNode) {
      this.canvas.remove();
    }
    this.canvas = undefined;
    this.ownsCanvas = false;
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
    return listDevices(this.settings.device, {
      redacted: this.simulatedGetUserMediaError?.name === "NotAllowedError",
    });
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

    this.fps = extractFrameRate(constraints);

    // Load the default media source on first use, so getUserMedia works with no
    // explicit setSource() call.
    if (!this.source) {
      await this.setSource(this.settings.mediaURL);
    }
    const source = this.source as FrameSource;

    this.releaseCanvas();

    if (source.captureCanvas) {
      // The consumer renders this canvas themselves: capture it as-is. No
      // context is acquired (a WebGL canvas has no 2D context), no drawing loop
      // runs, and the element is left exactly as we found it.
      this.canvas = source.captureCanvas;
      this.ownsCanvas = false;
      this.ctx = undefined;
      this.resolution = { ...source.size };

      if (this.debug) {
        const requested = resolveResolution(
          constraints,
          this.settings.device.videoResolutions,
          isPortraitViewport(),
        );
        if (
          requested.width !== this.resolution.width ||
          requested.height !== this.resolution.height
        ) {
          console.warn(
            `Requested ${requested.width}x${requested.height} but the supplied canvas is ${this.resolution.width}x${this.resolution.height}. The canvas is never resized; the track reports its real size.`,
          );
        }
      }
    } else {
      this.resolution = resolveResolution(
        constraints,
        this.settings.device.videoResolutions,
        isPortraitViewport(),
      );

      const { width, height } = this.resolution;

      const canvas = document.createElement("canvas");
      canvas.id = this.mediaMockCanvasId;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Failed to get 2D canvas context");
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      this.canvas = canvas;
      this.ownsCanvas = true;
      this.ctx = ctx;

      // The canvas must live in the document for HTMLCanvasElement.captureStream() to
      // produce a track whose intrinsic dimensions stay stable. On some browser
      // versions (e.g. WebKit 26-class running under xvfb), a detached canvas
      // produces a track whose videoWidth/videoHeight transiently report valid values
      // and then drop to 2×2, breaking <video> consumers. Hidden offscreen by default;
      // enableDebugMode() makes it visible.
      this.applyHiddenCanvasStyles(canvas);
      if (typeof document.body !== "undefined" && document.body !== null) {
        document.body.append(canvas);
      }

      await this.startDrawingLoop();
    }

    if (this.debug) {
      this.enableDebugMode();
    }

    // For the captureStream, we use the fps parameter directly
    const canvasStream = this.canvas.captureStream(this.fps);

    const videoTracks = canvasStream?.getVideoTracks() ?? [];

    // An explicit deviceId wins, then facingMode, then the first videoinput.
    const videoDevice = selectVideoDevice(this.settings.device, {
      deviceId: extractDeviceId(constraints),
      facingMode: extractFacingMode(constraints),
    });

    for (const track of videoTracks) {
      decorateVideoTrack(track, {
        device: videoDevice,
        fps: this.fps,
        resolution: this.resolution,
        deviceResolutions: this.settings.device.videoResolutions,
      });
    }

    this.currentStream = new MediaStream(
      this.mockedVideoTracksHandler(videoTracks),
    );

    return this.currentStream;
  }
}

export * from "./createMediaDeviceInfo";
export {
  type DeviceConfig,
  devices,
  type FrameSource,
  type GetUserMediaErrorName,
  type SimulatedErrorOptions,
  type SupportedConstraints,
};
export const MediaMock: MediaMockClass = new MediaMockClass();
