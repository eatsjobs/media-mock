import { MockMediaDeviceInfo } from "./createMediaDeviceInfo";
import { defineProperty } from "./defineProperty";
import { DeviceConfig, devices } from "./devices";
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

function playVideo(videoElement: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    videoElement.addEventListener("loadeddata", async () => {
      try {
        await videoElement.play();
        resolve();
      } catch (e: unknown) {
        console.error(e);
        resolve();
      }
    });
    videoElement.load();
  });
}

/**
 * MediaMock class.
 *
 * @example
 * ```ts
 * import { MediaMock, devices } from "@eatsjobs/media-mock";
 *   // Configure and initialize MediaMock with default settings
 *   MediaMock
 *     .setMediaURL("./assets/640x480-sample.png")
 *     .mock(devices["iPhone 12"]); // or devices["Samsung Galaxy M53"] for Android, "Mac Desktop" for desktop mediaDevice emulation
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
 * @typedef {MediaMockClass}
 */
export class MediaMockClass {
  public settings: Settings = {
    mediaURL: "./assets/640x480-sample.png",
    device: devices["iPhone 12"],
    constraints: devices["iPhone 12"].supportedConstraints,
    canvasScaleFactor: 1,
  };

  private readonly mediaMockImageId = "media-mock-image";

  private readonly mediaMockCanvasId = "media-mock-canvas";

  private currentImage: HTMLImageElement | undefined;

  private mapUnmockFunction: Map<
    keyof MockOptions["mediaDevices"],
    VoidFunction
  > = new Map();

  private currentStream: (MediaStream & { stop?: VoidFunction }) | undefined;

  private intervalId: ReturnType<typeof setTimeout> | null = null;

  private debug: boolean = false;

  private canvas: HTMLCanvasElement | undefined;

  private ctx: CanvasRenderingContext2D | undefined;

  private mockedVideoTracksHandler: (
    tracks: MediaStreamTrack[]
  ) => MediaStreamTrack[] = (tracks) => tracks;

  private fps: number = 30;
  private resolution: { width: number; height: number; } = { width: 640, height: 480 };

  /**
   * The Image or the video that will be used as source.
   * @public
   * @param {string} url
   * @returns {typeof MediaMock}
   */
  public setMediaURL(url: string): typeof MediaMock {
    this.settings.mediaURL = url;
    if (this.intervalId) {
      void this.startIntervalDrawing();
    }
    return this;
  }
  
  private async startIntervalDrawing(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    const { width, height } = this.resolution;
    
    if (isVideoURL(this.settings.mediaURL)) {
      const video = document.createElement("video");
      video.addEventListener("error", () => {
        console.error(
          "Failed to load video source. Ensure the format is supported and the URL is valid."
        );
      }, { once: true });

      video.src = this.settings.mediaURL;
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.autoplay = true;
      video.hidden = true;
      video.crossOrigin = "anonymous";
      await playVideo(video);

      this.intervalId = setInterval(() => {
        this.ctx?.clearRect(0, 0, width, height);
        this.ctx!.fillStyle = '#ffffff';
        this.ctx?.fillRect(0, 0, width, height);
        this.ctx?.drawImage(video, 0, 0, width, height);
      }, 1000 / this.fps);
    } else {
      this.currentImage = await loadImage(this.settings.mediaURL);
      this.currentImage.id = this.mediaMockImageId;

      if (this.debug) {
        console.log(`
          Canvas: ${width}x${height}, 
          Image: ${this.currentImage?.naturalWidth}x${this.currentImage?.naturalHeight}`
        );
      }

      this.intervalId = setInterval(() => {
        this.ctx?.clearRect(0, 0, width, height);
        this.ctx!.fillStyle = '#ffffff';
        this.ctx?.fillRect(0, 0, width, height);

        const { naturalWidth, naturalHeight } = this.currentImage!;
        const imageAspect = naturalWidth / naturalHeight;
        const canvasAspect = width / height;

        let scaledWidth, scaledHeight, offsetX, offsetY;
        
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
          scaledWidth = (height * safetyFactor) * imageAspect;
          offsetX = (width - scaledWidth) / 2;
          offsetY = (height - scaledHeight) / 2;
        }

        this.ctx?.drawImage(
          this.currentImage!,
          offsetX,
          offsetY,
          scaledWidth,
          scaledHeight
        );
      }, 1000 / this.fps);
    }
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
        (device) => device.deviceId !== deviceId
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
    return this;
  }

  public setMockedVideoTracksHandler(
    mockedVideoTracksHandler: (tracks: MediaStreamTrack[]) => MediaStreamTrack[]
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
    options: MockOptions = createDefaultMockOptions()
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
        (constraints: MediaStreamConstraints) => this.getMockStream(constraints)
      );
      this.mapUnmockFunction.set("getUserMedia", unmockGetUserMedia);
    }

    if (options?.mediaDevices.getSupportedConstraints) {
      const unmockGetSupportedConstraints = defineProperty(
        navigator.mediaDevices,
        "getSupportedConstraints",
        () => {
          return this.settings.constraints;
        }
      );
      this.mapUnmockFunction.set(
        "getSupportedConstraints",
        unmockGetSupportedConstraints
      );
    }

    if (options?.mediaDevices.enumerateDevices) {
      const unmockEnumerateDevices = defineProperty(
        navigator.mediaDevices,
        "enumerateDevices",
        async () => this.settings.device.mediaDeviceInfo
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
    this.mapUnmockFunction.forEach((unmock) => unmock());
    this.mapUnmockFunction.clear();

    return this;
  }

  private stopMockStream(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.currentStream?.getVideoTracks()?.forEach((track) => track.stop());
    this.currentStream?.stop?.(); // Stop the stream if needed
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

  private async getMockStream(
    constraints: MediaStreamConstraints
  ): Promise<MediaStream> {
    this.resolution = this.getResolution(
      constraints,
      this.settings.device
    );

    this.fps = this.getFPSFromConstraints(constraints);

    this.canvas = document.createElement("canvas");
    this.canvas.id = this.mediaMockCanvasId;
    
    const { width, height } = this.resolution;
    
    this.canvas.width = width;
    this.canvas.height = height;
    
    this.ctx = this.canvas.getContext("2d")!;
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, width, height);

    await this.startIntervalDrawing();

    if (this.debug) {
      this.enableDebugMode();
    }

    // For the captureStream, we use the fps parameter directly
    const canvasStream = this.canvas.captureStream(this.fps);
    
    this.currentStream = new MediaStream(
      this.mockedVideoTracksHandler(
        canvasStream?.getVideoTracks() ?? []
      )
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
   * Get the appropriate resolution based on device orientation
   * @param constraints Media constraints
   * @param deviceConfig Device configuration
   * @returns Resolution object with width and height
   */
  private getResolution(
    constraints: MediaStreamConstraints,
    deviceConfig: DeviceConfig
  ) {
    // First check if we're in portrait or landscape mode
    const isPortrait = window.innerHeight > window.innerWidth;
    
    // Get target dimensions from constraints
    const targetWidth = (constraints.video as MediaTrackConstraints).width || {
      ideal: 640,
    };
    const targetHeight = (constraints.video as MediaTrackConstraints).height || { 
      ideal: 480 
    };

    // Find matching resolution based on orientation
    let matchedResolution;
    
    if (isPortrait) {
      // In portrait mode, look for taller resolutions or swap dimensions
      matchedResolution = deviceConfig.videoResolutions.find(
        (res) => 
          res.height > res.width && // Find portrait-oriented resolutions first
          (typeof targetHeight === "number"
            ? res.height === targetHeight
            : res.height === targetHeight.ideal) &&
          (typeof targetWidth === "number"
            ? res.width === targetWidth
            : res.width === targetWidth.ideal)
      );
      
      // If no portrait resolution found, try to find a landscape one to swap
      if (!matchedResolution) {
        const landscapeRes = deviceConfig.videoResolutions.find(
          (res) =>
            (typeof targetWidth === "number"
              ? res.height === targetWidth  // Note: swapped dimensions
              : res.height === targetWidth.ideal) &&
            (typeof targetHeight === "number"
              ? res.width === targetHeight  // Note: swapped dimensions
              : res.width === targetHeight.ideal)
        );
        
        // If found, swap dimensions
        if (landscapeRes) {
          matchedResolution = {
            width: landscapeRes.height,
            height: landscapeRes.width
          };
        }
      }
    } else {
      // Standard landscape matching
      matchedResolution = deviceConfig.videoResolutions.find(
        (res) =>
          (typeof targetWidth === "number"
            ? res.width === targetWidth
            : res.width === targetWidth.ideal) &&
          (typeof targetHeight === "number"
            ? res.height === targetHeight
            : res.height === targetHeight.ideal)
      );
    }
    
    // If still no match, use most appropriate resolution based on orientation
    if (!matchedResolution) {
      if (isPortrait) {
        // Find the first portrait resolution or create one by swapping
        matchedResolution = deviceConfig.videoResolutions.find(res => res.height > res.width);
        
        if (!matchedResolution && deviceConfig.videoResolutions.length > 0) {
          // If no portrait resolutions, take first landscape and swap
          const firstRes = deviceConfig.videoResolutions[0];
          matchedResolution = {
            width: firstRes.height,
            height: firstRes.width
          };
        }
      }
    }
    
    // Final fallback to first resolution
    return matchedResolution || deviceConfig.videoResolutions[0];
  }
}

export * from "./createMediaDeviceInfo";
export { devices };
export const MediaMock: MediaMockClass = new MediaMockClass();
