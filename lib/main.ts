import { CaptureSurface } from "./captureSurface";
import { findUnsatisfiableConstraint } from "./constraintCheck";
import {
  extractAudioDeviceId,
  extractDeviceId,
  extractFacingMode,
  extractFrameRate,
  isAudioRequested,
  isVideoRequested,
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
import { deepCopy, deepFreeze } from "./deepCopy";
import {
  cloneDeviceConfig,
  listDevices,
  selectAudioDevice,
  selectVideoDevice,
} from "./deviceRegistry";
import {
  type DeviceConfig,
  devices,
  type SupportedConstraints,
} from "./devices";
import { DrawingLoop, TimerMode } from "./drawingLoop";
import { Microphone } from "./microphone";
import { MediaDevicesPatcher } from "./patchMediaDevices";
import { ReadyStateReporter } from "./readyState";
import { type Resolution, resolveResolution } from "./resolution";
import { CanvasSource } from "./sources/CanvasSource";
import { createSourceFromURL } from "./sources/createSource";
import type { FrameSource } from "./sources/FrameSource";
import {
  createSyntheticStream,
  createSyntheticVideoTrack,
} from "./syntheticStream";
import { decorateAudioTrack, decorateVideoTrack } from "./track";
import { VideoFrameCallbackDriver } from "./videoFrameCallback";

export interface MockOptions {
  /** Which `navigator.mediaDevices` methods to replace. All of them by default. */
  mediaDevices?: {
    getUserMedia?: boolean;
    getSupportedConstraints?: boolean;
    enumerateDevices?: boolean;
  };

  /**
   * Whether `getUserMedia` should produce real video frames.
   *
   * Painting frames needs a canvas with a 2D context and `captureStream()`,
   * which a DOM emulator (happy-dom, jsdom) does not have. Set `false` there:
   * the returned track carries the emulated camera's identity, settings and
   * capabilities, but no pixels.
   *
   * @default true
   */
  frames?: boolean;

  /**
   * Whether the mock should stand in for the frame-presentation signals a
   * `<video>` playing a mocked stream would otherwise never receive.
   *
   * WebKit on Linux decodes frames and advances `currentTime` but never
   * *presents* any, and both readiness signals are derived from presentation:
   * `requestVideoFrameCallback` never fires, and `readyState` never passes
   * `HAVE_FUTURE_DATA` (3). Consumers waiting on either never start, however
   * healthy the stream is. Running WebKit headless restores the callback but
   * not `readyState`; nothing restores `readyState`.
   *
   * With this on, both are answered from the same evidence: the video's decoded
   * frame count actually advancing. Neither speaks before a frame has arrived,
   * and both fall silent again if frames stop — so a stalled stream still looks
   * stalled. Videos playing anything else keep the browser's own behaviour, and
   * `unmock()` puts everything back.
   *
   * @default false
   */
  emulateVideoFrameCallback?: boolean;

  /**
   * Whether `getUserMedia` should produce an audio track.
   *
   * Needs Web Audio, which a DOM emulator does not have. With `false`, a
   * request for audio is refused with `NotFoundError` rather than silently
   * returning a stream without it.
   *
   * @default true
   */
  audio?: boolean;
}

/** A fully populated {@link MockOptions}, with every default filled in. */
interface ResolvedMockOptions {
  mediaDevices: {
    getUserMedia: boolean;
    getSupportedConstraints: boolean;
    enumerateDevices: boolean;
  };
  frames: boolean;
  audio: boolean;
  emulateVideoFrameCallback: boolean;
}

function resolveMockOptions(options?: MockOptions): ResolvedMockOptions {
  return {
    mediaDevices: {
      getUserMedia: options?.mediaDevices?.getUserMedia ?? true,
      getSupportedConstraints:
        options?.mediaDevices?.getSupportedConstraints ?? true,
      enumerateDevices: options?.mediaDevices?.enumerateDevices ?? true,
    },
    frames: options?.frames ?? true,
    audio: options?.audio ?? true,
    emulateVideoFrameCallback: options?.emulateVideoFrameCallback ?? false,
  };
}

/**
 * The subset of {@link Settings} a consumer can change directly. `mediaURL`,
 * `device` and `constraints` are set by {@link MediaMockClass.setSource} and
 * {@link MediaMockClass.mock} instead.
 */
export interface ConfigurableSettings {
  /** @see Settings.canvasScaleFactor */
  canvasScaleFactor?: number;
  /** @see Settings.mediaTimeout */
  mediaTimeout?: number;
  /** @see Settings.timerMode */
  timerMode?: TimerMode;
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
  // No window to measure (node): nothing to swap, so treat it as landscape.
  if (typeof window === "undefined") {
    return false;
  }
  return window.innerHeight > window.innerWidth;
}

/**
 * Whether this environment can actually paint and capture a canvas.
 *
 * Checked before any media is loaded: a DOM emulator will happily hand out a
 * canvas element and then return null for its context, and jsdom's `<img>`
 * never settles, so without this a frames request hangs for the whole media
 * timeout before failing somewhere less obvious.
 */
function canPaintFrames(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const probe = document.createElement("canvas");
  return (
    typeof probe.getContext === "function" &&
    probe.getContext("2d") != null &&
    typeof probe.captureStream === "function"
  );
}

/** The advice attached to every "this environment cannot paint" failure. */
const FRAMELESS_HINT =
  "This environment cannot paint frames — call mock(device, { frames: false }) " +
  "to stream a track that carries the camera's identity without pixels.";

/**
 * Every track on a stream. `getTracks()` is absent on happy-dom's MediaStream
 * (issue #11), so fall back to the per-kind accessors.
 */
function tracksOf(stream: MediaStream | undefined): MediaStreamTrack[] {
  if (!stream) {
    return [];
  }
  if (typeof stream.getTracks === "function") {
    return stream.getTracks();
  }
  return [
    ...(stream.getVideoTracks?.() ?? []),
    ...(stream.getAudioTracks?.() ?? []),
  ];
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
 *   await MediaMock.setSource("./assets/640x480-sample.png");
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
  /**
   * Mutable internal configuration, exposed publicly as a frozen snapshot via
   * {@link MediaMockClass.settings}.
   */
  private readonly state: Settings = {
    mediaURL:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgQn2nAAAAABJRU5ErkJggg==",
    device: devices["iPhone 12"],
    constraints: devices["iPhone 12"].supportedConstraints,
    canvasScaleFactor: 1,
    mediaTimeout: 60 * 1000, // 60 seconds
    timerMode: TimerMode.SetInterval,
  };

  /**
   * The current configuration, as a read-only snapshot. Frozen all the way
   * down: assigning at any depth throws, and the nested values are copies, so
   * the snapshot is never a way into the mock's own state. Use
   * {@link configure} (or the individual setters) to change it.
   *
   * @public
   */
  public get settings(): Readonly<Settings> {
    return deepFreeze(deepCopy(this.state));
  }

  /**
   * Updates configuration. Omitted options keep their current value.
   *
   * @example
   * ```ts
   * MediaMock.configure({ canvasScaleFactor: 0.8, timerMode: TimerMode.Raf });
   * ```
   *
   * @public
   * @param {ConfigurableSettings} options
   * @returns {this}
   */
  public configure(options: ConfigurableSettings): this {
    if (options.canvasScaleFactor !== undefined) {
      // Below ~0.1 the drawn image is too small to be a useful frame.
      this.state.canvasScaleFactor = Math.max(0.1, options.canvasScaleFactor);
    }

    if (options.mediaTimeout !== undefined) {
      if (options.mediaTimeout <= 0) {
        throw new Error("Media timeout must be a positive number");
      }
      this.state.mediaTimeout = options.mediaTimeout;
    }

    if (options.timerMode !== undefined) {
      this.state.timerMode = options.timerMode;
    }

    return this;
  }

  private readonly mediaMockCanvasId = "media-mock-canvas";

  /** What paints the frames — an image, a video, or anything implementing FrameSource. */
  private source: FrameSource | undefined;

  /**
   * A `setSource()` call that has not settled yet. `getUserMedia` waits on it,
   * so a caller who forgets to await `setSource()` still gets the source they
   * asked for rather than the default placeholder.
   */
  private pendingSource: Promise<void> | undefined;

  /** The canvas captureStream() runs on, created here or borrowed from a source. */
  private surface: CaptureSurface | undefined;

  private readonly loop = new DrawingLoop();

  private readonly patcher = new MediaDevicesPatcher();

  private readonly microphone = new Microphone();

  private readonly frameCallbacks = new VideoFrameCallbackDriver();

  private readonly readyState = new ReadyStateReporter();

  /** Streams this instance handed out, so the driver speaks only for them. */
  private readonly ownStreams = new WeakSet<MediaStream>();

  /** Whether this mock may paint frames and open a microphone. */
  private produceFrames = true;
  private produceAudio = true;

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
  public setSource(
    source: string | HTMLCanvasElement | FrameSource,
  ): Promise<MediaMockClass> {
    // Registered synchronously, before the first await, so a getUserMedia call
    // made in the same tick can see that a source is on its way.
    const applied = this.applySource(source);
    this.pendingSource = applied;

    return applied
      .then(() => this)
      .finally(() => {
        if (this.pendingSource === applied) {
          this.pendingSource = undefined;
        }
      });
  }

  private async applySource(
    source: string | HTMLCanvasElement | FrameSource,
  ): Promise<void> {
    const frameSource = this.toFrameSource(source);

    // Prepare the NEW source before touching any existing state, so a failed
    // load leaves the current source — and any running stream — untouched.
    await frameSource.prepare?.();

    this.source?.dispose?.();
    this.source = frameSource;

    if (typeof source === "string") {
      this.state.mediaURL = source;
    }

    if (this.debug && frameSource.element) {
      showForDebug(frameSource.element);
    }

    this.warnIfLiveStreamCannotFollow(frameSource);

    // Restart drawing with the new source if a stream is active. The loop
    // redraws immediately, so the canvas (and the captured track) picks up the
    // new content without a gap. A captured canvas has no loop to restart.
    if (!frameSource.captureCanvas && this.loop.running) {
      this.startDrawingLoop();
    }
  }

  /**
   * Warns when a source swap cannot reach an already-running stream.
   *
   * A track from `captureStream()` is bound for life to the canvas it was
   * captured from, and nothing can re-point it. A live stream therefore follows
   * a swap only while the canvas stays the same: that holds between painted
   * sources, since images and videos share the canvas MediaMock owns, but not
   * across the boundary to or from a canvas the consumer renders, nor between
   * two different consumer canvases.
   *
   * Without this the stream just freezes on its last frame, which gives the
   * caller nothing to go on.
   */
  private warnIfLiveStreamCannotFollow(next: FrameSource): void {
    const surface = this.surface;
    if (!this.currentStream || !surface) {
      return;
    }

    const cannotFollow = next.captureCanvas
      ? next.captureCanvas !== surface.canvas
      : !surface.owned;

    if (!cannotFollow) {
      return;
    }

    console.warn(
      "media-mock: the new source renders into a different canvas than the one " +
        "the active stream was captured from, so that stream's frames will stop " +
        "updating. Call getUserMedia() again to capture the new source.",
    );
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
        timeoutMs: this.state.mediaTimeout,
        scaleFactor: () => this.state.canvasScaleFactor,
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
      { fps: this.fps, mode: this.state.timerMode },
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
    this.state.device.mediaDeviceInfo.push(newDevice);
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
    this.state.device.mediaDeviceInfo =
      this.state.device.mediaDeviceInfo.filter(
        (device) => device.deviceId !== deviceId,
      );
    this.triggerDeviceChange();
    return this;
  }

  private triggerDeviceChange(): void {
    // The device list is updated either way; in an environment with no
    // MediaDevices (node) the notification simply has nowhere to go.
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      return;
    }
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
   * @param {MockOptions} [options] - which `navigator.mediaDevices` methods to
   * replace, and whether to produce frames and audio. Every member is optional.
   * @returns {typeof MediaMock}
   */
  public mock(device: DeviceConfig, options?: MockOptions): typeof MediaMock {
    const resolved = resolveMockOptions(options);
    this.produceFrames = resolved.frames;
    this.produceAudio = resolved.audio;

    if (resolved.emulateVideoFrameCallback) {
      const ours = (stream: MediaStream) => this.ownStreams.has(stream);
      this.frameCallbacks.install(ours);
      this.readyState.install(ours);
    }

    // Clone the config so addMockDevice/removeMockDevice never mutate the
    // caller's object (the exported presets are shared across tests).
    this.state.device = cloneDeviceConfig(device);
    this.state.constraints = this.state.device.supportedConstraints;

    if (!MediaDevicesPatcher.isSupported()) {
      console.warn(
        "MediaDevices is not available in this environment — mock() has no effect.",
      );
      return this;
    }

    if (resolved.mediaDevices.getUserMedia) {
      this.patcher.patch(
        "getUserMedia",
        (constraints: MediaStreamConstraints) =>
          this.getMockStream(constraints),
      );
    }

    if (resolved.mediaDevices.getSupportedConstraints) {
      // A copy per call, as real browsers build: returning the live object
      // would let a caller who edits the result corrupt the mock's own state.
      this.patcher.patch("getSupportedConstraints", () => ({
        ...this.state.constraints,
      }));
    }

    if (resolved.mediaDevices.enumerateDevices) {
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
    this.frameCallbacks.uninstall();
    this.readyState.uninstall();
    this.patcher.restoreAll();

    return this;
  }

  private stopMockStream(): void {
    // Stop the drawing loop (cancels RAF or clears interval)
    this.loop.stop();

    // Every track, not only video: an audio-only stream has no video tracks and
    // would otherwise stay live after unmock(). getTracks() is missing on some
    // emulated MediaStream implementations, so the per-kind lists stand in.
    for (const track of tracksOf(this.currentStream)) {
      track.stop();
    }
    this.currentStream?.stop?.(); // Stop the stream if needed
    this.currentStream = undefined;

    this.microphone.close();

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
  public setCanvasScaleFactor(factor: number): this {
    return this.configure({ canvasScaleFactor: factor });
  }

  /**
   * Set the timeout for media loading (images and videos) in milliseconds.
   *
   * @public
   * @param {number} timeoutMs - Timeout in milliseconds (default: 60000 = 60 seconds)
   * @returns {typeof MediaMock}
   */
  public setMediaTimeout(timeoutMs: number): this {
    return this.configure({ mediaTimeout: timeoutMs });
  }

  /**
   * Set the timer strategy used for the canvas drawing loop.
   *
   * @public
   * @param {TimerMode} mode - TimerMode.Auto | TimerMode.Raf | TimerMode.SetInterval
   * @returns {typeof MediaMock}
   */
  public setTimerMode(mode: TimerMode): this {
    return this.configure({ timerMode: mode });
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
    return listDevices(this.state.device, {
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

    const wantsVideo = isVideoRequested(constraints);
    const wantsAudio = isAudioRequested(constraints);

    // Browsers reject an empty request outright, before any device work.
    if (!wantsVideo && !wantsAudio) {
      throw new TypeError(
        "Failed to execute 'getUserMedia' on 'MediaDevices': At least one of audio and video must be requested",
      );
    }

    // An explicit deviceId wins, then facingMode, then the first videoinput.
    const videoDevice = selectVideoDevice(this.state.device, {
      deviceId: extractDeviceId(constraints),
      facingMode: extractFacingMode(constraints),
    });
    const audioDevice = selectAudioDevice(this.state.device, {
      deviceId: extractAudioDeviceId(constraints),
    });

    // getUserMedia is all-or-nothing: a request naming a kind the device does
    // not have fails outright rather than returning the other kind.
    // A runtime with no Web Audio cannot produce an audio track at all, which
    // is indistinguishable from having no microphone: refuse up front rather
    // than build the video half and hand back a partial stream.
    if (
      wantsAudio &&
      (!audioDevice || !this.produceAudio || !Microphone.isSupported())
    ) {
      throw createGetUserMediaError("NotFoundError");
    }
    if (wantsVideo && !videoDevice) {
      throw createGetUserMediaError("NotFoundError");
    }

    // Refuse before building anything, so a rejected request leaves no canvas
    // and no half-started drawing loop behind.
    const unsatisfiable = findUnsatisfiableConstraint({
      constraints,
      videoDevice,
      audioDevice,
      supportedConstraints: this.state.constraints,
    });
    if (unsatisfiable) {
      throw createGetUserMediaError("OverconstrainedError", {
        constraint: unsatisfiable,
      });
    }

    // Before any media is loaded, so an environment that can never paint fails
    // immediately rather than after the media timeout.
    if (wantsVideo && this.produceFrames && !canPaintFrames()) {
      throw new Error(`Cannot capture video frames. ${FRAMELESS_HINT}`);
    }

    const tracks: MediaStreamTrack[] = [];

    if (wantsVideo) {
      tracks.push(
        ...(this.produceFrames
          ? await this.captureVideoTracks(constraints, videoDevice)
          : this.framelessVideoTracks(constraints, videoDevice)),
      );
    }

    if (wantsAudio) {
      const audioTrack = this.microphone.open();
      if (!audioTrack) {
        // Guarded above, so this is unreachable — but silently dropping the
        // track here is the one thing the all-or-nothing contract forbids.
        throw createGetUserMediaError("NotFoundError");
      }
      decorateAudioTrack(audioTrack, { device: audioDevice });
      tracks.push(audioTrack);
    }

    // A synthetic track is not a real MediaStreamTrack, so a real MediaStream
    // will not accept it — and an emulator's MediaStream drops tracks anyway.
    this.currentStream = this.produceFrames
      ? new MediaStream(tracks)
      : createSyntheticStream(tracks);
    this.ownStreams.add(this.currentStream);

    return this.currentStream;
  }

  /**
   * Video tracks carrying the emulated camera's identity but no pixels, for
   * environments that cannot capture a canvas.
   */
  private framelessVideoTracks(
    constraints: MediaStreamConstraints,
    videoDevice: MockMediaDeviceInfo | undefined,
  ): MediaStreamTrack[] {
    const fps = extractFrameRate(constraints);
    const resolution = resolveResolution(
      constraints,
      this.state.device.videoResolutions,
      isPortraitViewport(),
    );

    const track = createSyntheticVideoTrack();
    decorateVideoTrack(track, {
      device: videoDevice,
      fps,
      resolution,
      deviceResolutions: this.state.device.videoResolutions,
    });

    return this.mockedVideoTracksHandler([track]);
  }

  /**
   * Paints the current source onto a capture canvas and returns the resulting
   * video tracks, decorated to look like the selected camera.
   */
  private async captureVideoTracks(
    constraints: MediaStreamConstraints,
    videoDevice: MockMediaDeviceInfo | undefined,
  ): Promise<MediaStreamTrack[]> {
    this.fps = extractFrameRate(constraints);

    // A setSource() still in flight decides what to stream. Without this wait,
    // a caller who did not await it would race: the source is only assigned once
    // its media has loaded, so this method would see none and substitute the
    // default placeholder — then discard the real source when it arrived.
    // A rejection belongs to whoever called setSource(), so it is not rethrown
    // here; the default below covers that case.
    if (this.pendingSource) {
      await this.pendingSource.catch(() => undefined);
    }

    // Load the default media source on first use, so getUserMedia works with no
    // explicit setSource() call.
    if (!this.source) {
      await this.setSource(this.state.mediaURL);
    }
    const source = this.source as FrameSource;

    this.releaseCanvas();

    const requested = resolveResolution(
      constraints,
      this.state.device.videoResolutions,
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

    for (const track of videoTracks) {
      decorateVideoTrack(track, {
        device: videoDevice,
        fps: this.fps,
        resolution: this.resolution,
        deviceResolutions: this.state.device.videoResolutions,
      });
    }

    return this.mockedVideoTracksHandler(videoTracks);
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
/** The shared instance, and the one the documentation uses. */
export const MediaMock: MediaMockClass = new MediaMockClass();

/**
 * Creates an independent MediaMock instance.
 *
 * Useful in tests: two instances share no configuration, device list, source or
 * simulated error, so state cannot leak between test files through the shared
 * singleton. `navigator.mediaDevices` is itself global, so only one instance
 * should be mocking it at a time.
 *
 * @example
 * ```ts
 * const mock = createMediaMock();
 * mock.mock(devices["iPhone 12"]);
 * await mock.setSource("./assets/frame.png");
 * mock.unmock();
 * ```
 *
 * @export
 * @returns {MediaMockClass}
 */
export function createMediaMock(): MediaMockClass {
  return new MediaMockClass();
}
