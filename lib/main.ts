import { CaptureSurface } from "./captureSurface";
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
  hideCanvasOffscreen,
  hideOffscreen,
  showCanvasForDebug,
  showForDebug,
} from "./debugView";
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
import { DrawingLoop, TimerMode } from "./drawingLoop";
import { MediaDevicesPatcher } from "./patchMediaDevices";
import { type Resolution, resolveResolution } from "./resolution";
import { CanvasSource } from "./sources/CanvasSource";
import { createSourceFromURL } from "./sources/createSource";
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

  /** The canvas captureStream() runs on, created here or borrowed from a source. */
  private surface: CaptureSurface | undefined;

  private readonly loop = new DrawingLoop();

  private readonly patcher = new MediaDevicesPatcher();

  private currentStream: (MediaStream & { stop?: VoidFunction }) | undefined;

  private debug: boolean = false;

  private mockedVideoTracksHandler: (
    tracks: MediaStreamTrack[],
  ) => MediaStreamTrack[] = (tracks) => tracks;

  private fps: number = 30;
  private resolution: Resolution = {
    width: 640,
    height: 480,
  };

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
    if (!frameSource.captureCanvas && this.loop.running) {
      this.startDrawingLoop();
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

  /**
   * (Re)starts painting the capture canvas from the current source. A borrowed
   * canvas paints itself, so there is nothing to drive.
   */
  private startDrawingLoop(): void {
    const source = this.source;
    const surface = this.surface;
    if (!source) {
      throw new Error("No media source loaded");
    }
    // No context means a borrowed canvas, which paints itself.
    if (!surface?.ctx) {
      return;
    }

    if (this.debug) {
      const { width, height } = surface.resolution;
      const { width: sourceWidth, height: sourceHeight } = source.size;
      console.log(`
          Canvas: ${width}x${height},
          Source: ${sourceWidth}x${sourceHeight}`);
    }

    this.loop.start(
      () => {
        surface.paint(source);
      },
      { fps: this.fps, mode: this.settings.timerMode },
    );
    surface.commitPixels();
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
    if (this.surface?.owned) {
      showCanvasForDebug(this.surface.canvas);
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

    if (this.surface?.owned) {
      hideCanvasOffscreen(this.surface.canvas);
    }

    const element = this.source?.element;
    if (element != null) {
      hideOffscreen(element);
    }

    return this;
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
    this.loop.stop();

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
    this.surface?.release();
    this.surface = undefined;
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

    const requested = resolveResolution(
      constraints,
      this.settings.device.videoResolutions,
      isPortraitViewport(),
    );

    this.surface = CaptureSurface.forSource(
      source,
      requested,
      this.mediaMockCanvasId,
    );
    this.resolution = this.surface.resolution;

    if (this.surface.owned) {
      this.startDrawingLoop();
    } else if (
      this.debug &&
      (requested.width !== this.resolution.width ||
        requested.height !== this.resolution.height)
    ) {
      console.warn(
        `Requested ${requested.width}x${requested.height} but the supplied canvas is ${this.resolution.width}x${this.resolution.height}. The canvas is never resized; the track reports its real size.`,
      );
    }

    if (this.debug) {
      this.enableDebugMode();
    }

    // For the captureStream, we use the fps parameter directly
    const canvasStream = this.surface.canvas.captureStream(this.fps);

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
  // Defined in ./drawingLoop but part of the public API since 1.3.0.
  TimerMode,
};
export const MediaMock: MediaMockClass = new MediaMockClass();
