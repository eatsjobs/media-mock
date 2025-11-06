import type { MockMediaDeviceInfo } from "./createMediaDeviceInfo";
import { defineProperty } from "./defineProperty";
import { type DeviceConfig, devices } from "./devices";
import { loadImage } from "./loadImage";

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
  constraints: MediaTrackConstraints;

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
}

function isVideoURL(url: string) {
  const videoExtensions = [
    "mp4",
    "webm",
    "ogg",
    "mov",
    "avi",
    "mkv",
    "flv",
    "wmv",
    "m4v",
    "3gp",
    "mpg",
    "mpeg",
    "asf",
    "rm",
    "vob",
  ];
  const extension = url.split(".").pop()?.toLowerCase();
  return videoExtensions.includes(extension ?? "");
}

/**
 * Check if RequestAnimationFrame is supported
 */
function isRAFSupported(): boolean {
  return typeof requestAnimationFrame === "function";
}

function playVideo(
  videoElement: HTMLVideoElement,
  timeoutMs: number = 60 * 1000,
) {
  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isPromiseSettled = false;

    /**
     * Cleanup function to remove all event listeners and timeout
     */
    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      videoElement.removeEventListener("loadeddata", onLoadedData);
      videoElement.removeEventListener("error", onError);
    };

    /**
     * Handle successful video loading
     */
    const onLoadedData = async () => {
      if (isPromiseSettled) return;
      isPromiseSettled = true;

      cleanup();

      try {
        await videoElement.play();
        resolve();
      } catch (e: unknown) {
        // Note: Autoplay may be blocked by browser, but video is still loaded
        // Log as warning, not error, and continue for testing purposes
        console.warn("Video autoplay failed (may be blocked by browser):", e);
        resolve(); // Continue anyway for testing - video is loaded even if autoplay blocked
      }
    };

    /**
     * Handle video loading errors
     */
    const onError = () => {
      if (isPromiseSettled) return;
      isPromiseSettled = true;

      cleanup();

      console.error(
        "Failed to load video source. Ensure the format is supported and the URL is valid.",
      );
      console.error("Video error details:", {
        error: videoElement.error?.message,
        target: videoElement,
        networkState: videoElement.networkState,
        readyState: videoElement.readyState,
        currentSrc: videoElement.currentSrc,
      });
      reject(new Error(`Video failed to load: ${videoElement.src}`));
    };

    /**
     * Handle timeout
     */
    const onTimeout = () => {
      if (isPromiseSettled) return;
      isPromiseSettled = true;

      cleanup();

      reject(
        new Error(`Video loading timed out after ${timeoutMs / 1000} seconds`),
      );
    };

    // Set up timeout
    timeoutId = setTimeout(onTimeout, timeoutMs);

    // Add event listeners
    videoElement.addEventListener("loadeddata", onLoadedData, { once: true });
    videoElement.addEventListener("error", onError, { once: true });

    // Start loading
    videoElement.load();
  });
}

async function loadMedia(
  mediaURL: string,
  timeoutMs: number = 60 * 1000,
): Promise<HTMLImageElement | HTMLVideoElement> {
  if (isVideoURL(mediaURL)) {
    const video = document.createElement("video");
    video.src = mediaURL;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;
    video.hidden = true;
    video.crossOrigin = "anonymous";
    await playVideo(video, timeoutMs);
    return video;
  } else {
    return await loadImage(mediaURL, timeoutMs);
  }
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
  };

  private readonly mediaMockImageId = "media-mock-image";

  private readonly mediaMockCanvasId = "media-mock-canvas";

  private currentImage: HTMLImageElement | undefined;

  private currentVideo: HTMLVideoElement | undefined;

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
  private resolution: { width: number; height: number } = {
    width: 640,
    height: 480,
  };

  private lastDrawTime: number = 0;

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

    // Load and validate the NEW media before updating settings
    const media = await loadMedia(mediaURL, this.settings.mediaTimeout);

    // Update settings after successful load
    this.settings.mediaURL = mediaURL;

    // Clean up old media and store new media
    if (media instanceof HTMLImageElement) {
      if (this.currentVideo) {
        this.currentVideo.pause();
        this.currentVideo.src = "";
      }
      this.currentImage = media;
      this.currentVideo = undefined;
    } else if (media instanceof HTMLVideoElement) {
      if (this.currentImage) {
        this.currentImage.src = "";
      }
      this.currentVideo = media;
      this.currentImage = undefined;
    }

    // Restart drawing with new media if stream is active
    // Check both intervalId (setInterval) and rafId (RequestAnimationFrame)
    if (this.intervalId !== null || this.rafId !== null) {
      await this.startDrawingLoop();
    }
    return this;
  }

  private async startDrawingLoop(): Promise<void> {
    // Stop any existing drawing loop
    this.stopDrawingLoop();

    const { width, height } = this.resolution;

    if (isVideoURL(this.settings.mediaURL)) {
      if (!this.currentVideo) {
        throw new Error("Video media not loaded");
      }

      this.startVideoDrawingLoop(width, height);
    } else {
      if (!this.currentImage) {
        throw new Error("Image media not loaded");
      }

      if (this.debug) {
        console.log(`
          Canvas: ${width}x${height},
          Image: ${this.currentImage.naturalWidth}x${this.currentImage.naturalHeight}`);
      }

      this.startImageDrawingLoop(width, height);
    }
  }

  /**
   * Start drawing loop for video using RequestAnimationFrame with FPS throttling
   */
  private startVideoDrawingLoop(width: number, height: number): void {
    const frameInterval = 1000 / this.fps; // Time between frames in ms
    this.lastDrawTime = performance.now();

    const drawFrame = () => {
      if (!this.ctx || !this.currentVideo) {
        return;
      }

      const now = performance.now();

      // Only draw if enough time has passed based on FPS
      if (now - this.lastDrawTime >= frameInterval) {
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, width, height);
        this.ctx.drawImage(this.currentVideo, 0, 0, width, height);
        this.lastDrawTime = now;
      }

      if (isRAFSupported()) {
        this.rafId = requestAnimationFrame(drawFrame);
      }
    };

    if (isRAFSupported()) {
      // Use RequestAnimationFrame for better performance
      this.rafId = requestAnimationFrame(drawFrame);
    } else {
      // Fallback to setInterval for browsers without RAF
      this.intervalId = setInterval(() => {
        if (!this.ctx || !this.currentVideo) {
          return;
        }
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, width, height);
        this.ctx.drawImage(this.currentVideo, 0, 0, width, height);
      }, frameInterval);
    }
  }

  /**
   * Start drawing loop for image using RequestAnimationFrame
   * For static images, draws once and then relies on canvas stream
   */
  private startImageDrawingLoop(width: number, height: number): void {
    const drawImage = () => {
      if (!this.ctx || !this.currentImage) {
        return;
      }

      this.currentImage.id = this.mediaMockImageId;
      this.ctx.clearRect(0, 0, width, height);
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(0, 0, width, height);

      const { naturalWidth, naturalHeight } = this.currentImage;

      // Validate dimensions to prevent divide by zero
      if (
        naturalHeight === 0 ||
        height === 0 ||
        !Number.isFinite(naturalWidth / naturalHeight) ||
        !Number.isFinite(width / height)
      ) {
        return; // Skip drawing if dimensions are invalid
      }

      const imageAspect = naturalWidth / naturalHeight;
      const canvasAspect = width / height;

      let scaledWidth: number,
        scaledHeight: number,
        offsetX: number,
        offsetY: number;

      const safetyFactor = this.settings.canvasScaleFactor;

      if (imageAspect > canvasAspect) {
        // Image is wider (relative to height) than canvas
        scaledWidth = width * safetyFactor;
        scaledHeight = (width * safetyFactor) / imageAspect;
        offsetX = (width - scaledWidth) / 2;
        offsetY = (height - scaledHeight) / 2;
      } else {
        // Image is taller (relative to width) than canvas
        scaledHeight = height * safetyFactor;
        scaledWidth = height * safetyFactor * imageAspect;
        offsetX = (width - scaledWidth) / 2;
        offsetY = (height - scaledHeight) / 2;
      }

      this.ctx.drawImage(
        this.currentImage,
        offsetX,
        offsetY,
        scaledWidth,
        scaledHeight,
      );

      // For images, schedule next draw with RequestAnimationFrame
      if (isRAFSupported()) {
        this.rafId = requestAnimationFrame(drawImage);
      }
    };

    if (isRAFSupported()) {
      // Use RequestAnimationFrame for images
      this.rafId = requestAnimationFrame(drawImage);
    } else {
      // Fallback to setInterval for browsers without RAF
      const frameInterval = 1000 / this.fps;
      this.intervalId = setInterval(drawImage, frameInterval);
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

    if (
      this.canvas != null &&
      document.querySelector(this.mediaMockCanvasId) == null
    ) {
      this.canvas.style.border = "10px solid red";
      document.body.append(this.canvas);
    }

    if (
      this.currentImage != null &&
      document.querySelector(this.mediaMockImageId) == null
    ) {
      this.currentImage.style.border = "10px solid red";
      document.body.append(this.currentImage);
    }

    return this;
  }

  /**
   * Removes the debug canvas and image from the body.
   *
   * @public
   * @returns {typeof MediaMock}
   */
  public disableDebugMode(): typeof MediaMock {
    this.debug = false;
    const canvas = document.getElementById(this.mediaMockCanvasId);
    const image = document.getElementById(this.mediaMockImageId);

    canvas?.remove();
    image?.remove();

    // Also remove from stored references if they exist
    if (this.currentImage?.parentNode) {
      this.currentImage.style.border = "";
      this.currentImage.remove();
    }
    if (this.canvas?.parentNode) {
      this.canvas.style.border = "";
      this.canvas.remove();
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
    this.settings.device = device;

    if (typeof navigator.mediaDevices === "undefined") {
      class MockedMediaDevices extends EventTarget {}
      defineProperty(navigator, "mediaDevices", new MockedMediaDevices());
    }

    if (options?.mediaDevices.getUserMedia) {
      const unmockGetUserMedia = defineProperty(
        navigator.mediaDevices,
        "getUserMedia",
        (constraints: MediaStreamConstraints) =>
          this.getMockStream(constraints),
      );
      this.mapUnmockFunction.set("getUserMedia", unmockGetUserMedia);
    }

    if (options?.mediaDevices.getSupportedConstraints) {
      const unmockGetSupportedConstraints = defineProperty(
        navigator.mediaDevices,
        "getSupportedConstraints",
        () => {
          return this.settings.constraints;
        },
      );
      this.mapUnmockFunction.set(
        "getSupportedConstraints",
        unmockGetSupportedConstraints,
      );
    }

    if (options?.mediaDevices.enumerateDevices) {
      const unmockEnumerateDevices = defineProperty(
        navigator.mediaDevices,
        "enumerateDevices",
        async () => this.settings.device.mediaDeviceInfo,
      );
      this.mapUnmockFunction.set("enumerateDevices", unmockEnumerateDevices);
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

    if (this.currentVideo) {
      this.currentVideo.pause();
      this.currentVideo.src = "";
      this.currentVideo = undefined;
    }
    if (this.currentImage) {
      this.currentImage.src = "";
      this.currentImage = undefined;
    }

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

  private async getMockStream(
    constraints: MediaStreamConstraints,
  ): Promise<MediaStream> {
    this.resolution = this.getResolution(constraints, this.settings.device);

    this.fps = this.getFPSFromConstraints(constraints);

    this.canvas = document.createElement("canvas");
    this.canvas.id = this.mediaMockCanvasId;

    const { width, height } = this.resolution;

    this.canvas.width = width;
    this.canvas.height = height;

    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      throw new Error("Failed to get 2D canvas context");
    }

    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, width, height);

    await this.setMediaURL(this.settings.mediaURL);
    await this.startDrawingLoop();

    if (this.debug) {
      this.enableDebugMode();
    }

    // For the captureStream, we use the fps parameter directly
    const canvasStream = this.canvas.captureStream(this.fps);

    const videoTracks = canvasStream?.getVideoTracks() ?? [];

    // We detect the facing mode from constraints and get the video device based on that
    // then we override the id and label based on that
    const facingMode = this.getFacingModeFromConstraints(constraints);
    const videoDevice = this.getDeviceForFacingMode(
      facingMode,
      this.settings.device,
    );

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

        return settings;
      };
    });

    this.currentStream = new MediaStream(
      this.mockedVideoTracksHandler(videoTracks),
    );

    return this.currentStream;
  }

  private getFPSFromConstraints(constraints: MediaStreamConstraints): number {
    if (typeof constraints.video === "object" && constraints.video.frameRate) {
      return typeof constraints.video.frameRate === "number"
        ? constraints.video.frameRate
        : constraints.video.frameRate.ideal || 30;
    }
    return 30;
  }

  /**
   * Extract facingMode from constraints (can be a string or ConstrainDOMString)
   */
  private getFacingModeFromConstraints(
    constraints: MediaStreamConstraints,
  ): string | null {
    if (typeof constraints.video === "object" && constraints.video.facingMode) {
      const facingMode = constraints.video.facingMode;
      if (typeof facingMode === "string") {
        return facingMode;
      }
      // facingMode can be an object with ideal/exact properties
      const facingModeObj = facingMode as Record<string, unknown>;
      if (facingModeObj.ideal) {
        const ideal = facingModeObj.ideal;
        return Array.isArray(ideal) ? ideal[0] : (ideal as string);
      }
      if (facingModeObj.exact) {
        const exact = facingModeObj.exact;
        return Array.isArray(exact) ? exact[0] : (exact as string);
      }
    }
    return null;
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

  /**
   * Get the appropriate resolution based on device orientation and constraints
   * @param constraints Media constraints
   * @param deviceConfig Device configuration
   * @returns Resolution object with width and height
   */
  private getResolution(
    constraints: MediaStreamConstraints,
    deviceConfig: DeviceConfig,
  ): { width: number; height: number } {
    const isPortrait = window.innerHeight > window.innerWidth;
    const videoConstraints = (constraints.video as MediaTrackConstraints) || {};

    // Extract ideal dimensions from constraints
    const targetWidth = this.extractConstraintValue(
      videoConstraints.width,
      640,
    );
    const targetHeight = this.extractConstraintValue(
      videoConstraints.height,
      480,
    );

    // Try exact match first
    let matchedResolution = this.findExactMatch(
      deviceConfig.videoResolutions,
      targetWidth,
      targetHeight,
      isPortrait,
    );

    // If no exact match, find best fit by aspect ratio
    if (!matchedResolution) {
      matchedResolution = this.findBestFitResolution(
        deviceConfig.videoResolutions,
        targetWidth,
        targetHeight,
        isPortrait,
      );
    }

    // Final fallback
    if (!matchedResolution) {
      matchedResolution = this.getFallbackResolution(
        deviceConfig.videoResolutions,
        isPortrait,
      );
    }

    return matchedResolution;
  }

  /**
   * Extract numeric value from constraint (handles number, object with ideal/exact, etc.)
   */
  private extractConstraintValue(
    constraint: number | ConstrainULong | undefined,
    defaultValue: number,
  ): number {
    if (typeof constraint === "number") {
      return constraint;
    }
    if (constraint && typeof constraint === "object") {
      return (
        constraint.ideal ?? constraint.exact ?? constraint.max ?? defaultValue
      );
    }
    return defaultValue;
  }

  /**
   * Find exact resolution match considering orientation
   */
  private findExactMatch(
    resolutions: { width: number; height: number }[],
    targetWidth: number,
    targetHeight: number,
    isPortrait: boolean,
  ): { width: number; height: number } | undefined {
    // Try direct match first
    const directMatch = resolutions.find(
      (res) => res.width === targetWidth && res.height === targetHeight,
    );

    // whatever
    if (directMatch) {
      // If we have direct match but in portrait mode and it's landscape resolution, swap it
      if (isPortrait && directMatch.width > directMatch.height) {
        return { width: directMatch.height, height: directMatch.width };
      }
      return directMatch;
    }

    // If portrait mode, try to find a landscape resolution that can be swapped
    if (isPortrait) {
      const landscapeToSwap = resolutions.find(
        (res) => res.width === targetHeight && res.height === targetWidth,
      );

      if (landscapeToSwap) {
        return { width: landscapeToSwap.height, height: landscapeToSwap.width };
      }
    }

    return undefined;
  }

  /**
   * Find best resolution match by aspect ratio and size preference
   */
  private findBestFitResolution(
    resolutions: { width: number; height: number }[],
    targetWidth: number,
    targetHeight: number,
    isPortrait: boolean,
  ): { width: number; height: number } {
    const targetAspectRatio = targetWidth / targetHeight;
    const targetPixels = targetWidth * targetHeight;

    // Score each resolution
    const scoredResolutions = resolutions.map((res) => {
      const actualRes =
        isPortrait && res.width > res.height
          ? { width: res.height, height: res.width } // Swap if needed for portrait
          : res;

      const aspectRatio = actualRes.width / actualRes.height;
      const pixels = actualRes.width * actualRes.height;

      // Calculate aspect ratio difference (lower is better)
      const aspectDiff = Math.abs(aspectRatio - targetAspectRatio);

      // Calculate size difference (prefer closest to target)
      const sizeDiff = Math.abs(pixels - targetPixels) / targetPixels;

      // Combined score (lower is better)
      const score = aspectDiff * 2 + sizeDiff;

      return { resolution: actualRes, score };
    });

    // Return resolution with lowest score
    scoredResolutions.sort((a, b) => a.score - b.score);
    return scoredResolutions[0].resolution;
  }

  /**
   * Get fallback resolution based on orientation
   */
  private getFallbackResolution(
    resolutions: { width: number; height: number }[],
    isPortrait: boolean,
  ): { width: number; height: number } {
    if (resolutions.length === 0) {
      return { width: 640, height: 480 }; // Ultimate fallback
    }

    if (isPortrait) {
      // Prefer portrait resolutions, or swap landscape ones
      const portraitRes = resolutions.find((res) => res.height > res.width);
      if (portraitRes) return portraitRes;

      // Swap first landscape resolution
      const firstRes = resolutions[0];
      return { width: firstRes.height, height: firstRes.width };
    }

    // For landscape, prefer landscape resolutions
    const landscapeRes = resolutions.find((res) => res.width >= res.height);
    return landscapeRes || resolutions[0];
  }
}

export * from "./createMediaDeviceInfo";
export { devices, type DeviceConfig };
export const MediaMock: MediaMockClass = new MediaMockClass();
