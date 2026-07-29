import type {
  EnhancedMediaTrackCapabilities,
  MockMediaDeviceInfo,
} from "./createMediaDeviceInfo";
import type { Resolution } from "./resolution";

/**
 * Making a canvas-capture track look like a camera track.
 *
 * A track from `canvas.captureStream()` reports a synthetic id, an empty label,
 * and settings missing fields every real device provides. Consumers routinely
 * read those to pick a camera, so the mock fills them in.
 */

export interface TrackDecoration {
  /** The device this stream is pretending to come from, when one was selected. */
  device: MockMediaDeviceInfo | undefined;
  /** Frames per second the capture was started with. */
  fps: number;
  /** Size of the captured canvas. */
  resolution: Resolution;
  /** Resolutions the emulated device supports, for a capabilities fallback. */
  deviceResolutions: readonly Resolution[];
}

/**
 * Rewrites a captured track's identity and settings in place.
 */
export function decorateVideoTrack(
  track: MediaStreamTrack,
  { device, fps, resolution, deviceResolutions }: TrackDecoration,
): void {
  if (device?.label) {
    Object.defineProperty(track, "label", {
      value: device.label,
      writable: false,
      configurable: false,
    });
  }

  // The track id doubles as the device id for consumers that compare them.
  if (device?.deviceId) {
    Object.defineProperty(track, "id", {
      value: device.deviceId,
      writable: false,
      configurable: false,
    });
  }

  // Every real device exposes getCapabilities; some browsers omit it on a
  // canvas-capture track.
  if (!track.getCapabilities) {
    track.getCapabilities = device?.getCapabilities
      ? () => device.getCapabilities()
      : () => capabilitiesFromResolutions(deviceResolutions);
  }

  const originalGetSettings = track.getSettings.bind(track);
  track.getSettings = () => {
    const settings = originalGetSettings();

    // Real devices always report a frame rate and a frame size.
    if (settings.frameRate === undefined) {
      settings.frameRate = fps;
    }
    if (settings.width === undefined || settings.height === undefined) {
      settings.width = resolution.width;
      settings.height = resolution.height;
    }

    // Real devices expose the source device's id. Some browsers put the
    // canvas-stream's random track uuid here instead, which is misleading.
    if (device?.deviceId) {
      settings.deviceId = device.deviceId;
    }

    // Consumers read facingMode to tell front from back — especially on iOS
    // Safari, where one physical back camera appears under several labels.
    if (settings.facingMode === undefined) {
      const supported = device?.getCapabilities?.().facingMode;
      if (Array.isArray(supported) && supported.length > 0) {
        settings.facingMode = supported[0];
      }
    }

    return settings;
  };
}

/**
 * Capabilities derived from the device's resolution list, used when the device
 * config declares none of its own.
 */
function capabilitiesFromResolutions(
  resolutions: readonly Resolution[],
): EnhancedMediaTrackCapabilities {
  const widths = resolutions.map((res) => res.width);
  const heights = resolutions.map((res) => res.height);

  return {
    width: { min: Math.min(...widths), max: Math.max(...widths) },
    height: { min: Math.min(...heights), max: Math.max(...heights) },
    frameRate: { min: 1, max: 60 },
    facingMode: ["user", "environment"],
    resizeMode: ["none", "crop-and-scale"],
  };
}
