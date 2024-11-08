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
   * The image url to use for the mock.
   *
   * @type {string}
   */
  imageURL: string;

  /**
   * The preset device config to emulate
   *
   * @type {DeviceConfig}
   */
  device: DeviceConfig;
  constraints: MediaTrackConstraints;
}


/**
 * MediaMock class.
 * 
 * @example
 * ```ts
 * import { MediaMock, devices } from "@eatsjobs/media-mock";
 *   // Configure and initialize MediaMock with default settings
 *   MediaMock
 *     .setImageURL("./assets/640x480-sample.png")
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
    imageURL: "./assets/640x480-sample.png",
    device: devices["iPhone 12"],
    constraints: devices["iPhone 12"].supportedConstraints,
  };

  private readonly mediaMockImageId = "media-mock-image";

  private readonly mediaMockCanvasId = "media-mock-canvas";

  private currentImage: HTMLImageElement | undefined = new Image();

  private mapUnmockFunction: Map<
    keyof MockOptions["mediaDevices"],
    VoidFunction
  > = new Map();

  private currentStream: (MediaStream & { stop?: VoidFunction }) | undefined;

  private intervalId: ReturnType<typeof setTimeout> | null = null;

  private debug: boolean = false;

  private canvas: HTMLCanvasElement | undefined;

  private ctx: CanvasRenderingContext2D | undefined;

  /**
   * The Image that will be used as video source.
   *
   * @public
   * @param {string} url
   * @returns {typeof MediaMock}
   */
  public setImageURL(url: string): typeof MediaMock {
    this.settings.imageURL = url;
    return this;
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
   * Debug mode will append the canvas and loaded image to the body
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

  private async getMockStream(
    constraints: MediaStreamConstraints
  ): Promise<MediaStream> {
    const { width, height } = this.getResolution(
      constraints,
      this.settings.device
    );
    const fps = this.getFPSFromConstraints(constraints);

    // Load the image and prepare the canvas
    this.currentImage = await loadImage(this.settings.imageURL);
    this.currentImage.id = this.mediaMockImageId;

    this.canvas = document.createElement("canvas");
    this.canvas.id = this.mediaMockCanvasId;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d")!;

    // Set an interval to update the canvas
    this.intervalId = setInterval(() => {
      // Calculate the position to center the image within the canvas
      const offsetX = (width - this.currentImage!.width) / 2;
      const offsetY = (height - this.currentImage!.height) / 2;
      this.ctx?.clearRect(0, 0, width, height); // Clear the canvas
      this.ctx?.drawImage(this.currentImage!, offsetX, offsetY); // Draw the image in the center of the canvas
    }, 1000 / fps);

    if (this.debug) {
      this.enableDebugMode();
    }

    this.currentStream = this.canvas.captureStream(fps);
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

  private getResolution(
    constraints: MediaStreamConstraints,
    deviceConfig: DeviceConfig
  ) {
    const targetWidth = (constraints.video as MediaTrackConstraints).width || {
      ideal: 640,
    };
    const targetHeight = (constraints.video as MediaTrackConstraints)
      .height || { ideal: 480 };

    return (
      deviceConfig.videoResolutions.find(
        (res) =>
          (typeof targetWidth === "number"
            ? res.width === targetWidth
            : res.width === targetWidth.ideal) &&
          (typeof targetHeight === "number"
            ? res.height === targetHeight
            : res.height === targetHeight.ideal)
      ) || deviceConfig.videoResolutions[0]
    );
  }
}

export { createMediaDeviceInfo } from "./createMediaDeviceInfo";
export { devices };
export const MediaMock: MediaMockClass = new MediaMockClass();
